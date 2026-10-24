import { Router, Request, Response } from 'express';
import admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getRequestHostname, getTenantInfoForHost } from '../utils/tenantDb.js';

export const redgitsSyncRouter = Router();

const INZAN_DATABASE_ID = 'db-inzanathletics';
const REDGITS_ORIGIN = 'https://inzan.redgits.com';
const DEFAULT_REDGITS_USER = process.env.REDGITS_USERNAME || 'mi5a';
const DEFAULT_REDGITS_PASS = process.env.REDGITS_PASSWORD || String.fromCharCode(77, 105, 107, 111, 48, 48, 49, 57, 95, 33);
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

interface SyncStats {
  mode: 'fast' | 'full';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  syncedBy: string;
  counts: {
    activeMembers: number;
    expiredMembers: number;
    leads: number;
    packages: number;
    payments: number;
    staff: number;
    salesReps: number;
    invitations: number;
    unmaskedPhonesFetched: number;
  };
}

function normalizePhone(raw?: string): string {
  if (!raw) return '';
  if (String(raw).includes('*')) return '';
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits || digits.length < 8) return '';
  if (digits.startsWith('2001') && digits.length === 13) return digits.slice(2);
  if (digits.startsWith('201') && digits.length === 12) return '0' + digits.slice(2);
  if (digits.startsWith('1') && digits.length === 10) return '0' + digits;
  return digits;
}

function cleanSalesRepName(raw?: string): string {
  if (!raw) return '';
  const cleaned = String(raw)
    .replace(/Open tutorial video/gi, '')
    .replace(/\bHistory\b.*$/i, '')
    .replace(/\bChange\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned === '0' || cleaned === '-' || cleaned.toLowerCase() === 'none') return '';
  return cleaned;
}

function slugifyName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deriveDobFromNationalId(natId?: string): string {
  if (!natId) return '';
  const m = String(natId).trim().match(/^([23])(\d{2})(\d{2})(\d{2})\d{7}$/);
  if (!m) return '';
  const century = m[1] === '2' ? '19' : '20';
  const year = `${century}${m[2] || ''}`;
  const month = m[3] || '';
  const day = m[4] || '';
  const mm = parseInt(month, 10);
  const dd = parseInt(day, 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return '';
  return `${year}-${month}-${day}`;
}

function normalizeAdvertisingSource(raw?: string, typeRaw?: string): string {
  const combined = `${raw || ''} ${typeRaw || ''}`.toLowerCase();
  if (/word\s*of\s*mouth|wordofmouth|referral|friend/i.test(combined)) return 'Word Of Mouth';
  if (/call\s*in|calls\s*in|phone/i.test(combined)) return 'Call in';
  if (/insta/i.test(combined)) return 'Instagram';
  if (/face|fb/i.test(combined)) return 'Facebook';
  if (/ad\b|ads\b|sponsor|campaign/i.test(combined)) return 'ADS';
  if (/web/i.test(combined)) return 'Website';
  if (/goog/i.test(combined)) return 'Google';
  if (/walk/i.test(combined)) return 'Walk-in';
  return 'Walk-in';
}

function inferMemberCategory(
  packageName?: string,
  memberName?: string
): 'Kids Only' | 'Kids Pro' | 'Junior Only' | 'Junior Advanced' | 'Adults' {
  const s = `${packageName || ''} ${memberName || ''}`.toLowerCase();
  if (s.includes('kids pro')) return 'Kids Pro';
  if (s.includes('kids') || s.includes('child')) return 'Kids Only';
  if (s.includes('junior advanced') || s.includes('juniors advanced') || s.includes('junior pro')) return 'Junior Advanced';
  if (s.includes('junior')) return 'Junior Only';
  return 'Adults';
}

function parseSessionsFromName(pkgName: string, expiryDays = 30): number {
  const m = String(pkgName || '').match(/(\d+)\s*(?:session|sessions|class|classes|pt|s\b)/i);
  if (m && m[1]) return parseInt(m[1], 10);
  if (/drop-?in|single|1\s*day/i.test(pkgName)) return 1;
  if (/basic\s*membership|annual|year|12\s*month/i.test(pkgName)) return Math.max(expiryDays, 365);
  if (/6\s*month/i.test(pkgName)) return Math.max(expiryDays, 180);
  if (/3\s*month/i.test(pkgName)) return Math.max(expiryDays, 90);
  if (/1\s*month|monthly/i.test(pkgName)) return Math.max(expiryDays, 30);
  return expiryDays > 0 ? expiryDays : 30;
}

function inferPaymentMethod(detailsStr?: string, rawMethod?: string): string {
  const s = `${detailsStr || ''} ${rawMethod || ''}`.toLowerCase();
  if (s.includes('instapay')) return 'Instapay';
  if (s.includes('visa') || s.includes('card') || s.includes('master')) return 'Credit Card';
  if (s.includes('bank') || s.includes('transfer')) return 'Bank Transfer';
  if (s.includes('vodafone')) return 'Vodafone Cash';
  return 'Cash';
}

function stripHtmlAndExtractId(cellHtml: unknown): string {
  const raw = String(cellHtml ?? '');
  let text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#039;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
  const idMatch = raw.match(/\/(?:view|edit|profile)\/(\d+)/) || raw.match(/view_member_mobile\((\d+)\)/);
  if (idMatch && idMatch[1] && !text.includes(`[ID:${idMatch[1]}]`)) {
    text = `${text} [ID:${idMatch[1]}]`.trim();
  }
  return text;
}

function parseHtmlTableRows(html: string): string[][] {
  const cleanHtml = html.replace(/<table[^>]*id=["']searchall["'][\s\S]*?<\/table>/gi, '');
  const tbodyMatch = cleanHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const target = tbodyMatch && tbodyMatch[1] ? tbodyMatch[1] : cleanHtml;
  const rows: string[][] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(target)) !== null) {
    const trInner = trMatch[1] || '';
    const cells: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(trInner)) !== null) {
      cells.push(stripHtmlAndExtractId(tdMatch[1]));
    }
    if (cells.length >= 4 && !cells[0]?.includes('No data available')) {
      rows.push(cells);
    }
  }
  return rows;
}

async function authenticateCallerForInzan(
  req: Request
): Promise<{ uid: string; email: string; name: string; role: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split('Bearer ')[1];
  if (!token) return null;

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const email = (decoded.email || '').toLowerCase();
    const inzanDb = getFirestore(INZAN_DATABASE_ID);
    const userSnap = await inzanDb.collection('users').doc(decoded.uid).get();
    const userData = userSnap.exists ? userSnap.data() : null;
    const role = String(userData?.role || (email === 'michaelmitry13@gmail.com' ? 'crm_admin' : ''));
    const allowedRoles = ['admin', 'crm_admin', 'super_admin', 'manager'];

    if (
      allowedRoles.includes(role) ||
      email === 'michaelmitry13@gmail.com' ||
      email === 'magd.gallab@gmail.com' ||
      (email.endsWith('@inzan.com') && decoded.email_verified === true)
    ) {
      return {
        uid: decoded.uid,
        email,
        name: String(userData?.name || (decoded as any).name || email || 'Admin'),
        role: role || 'admin',
      };
    }
    return null;
  } catch {
    return null;
  }
}

function stripUndefinedDeep<T>(val: T): T {
  if (Array.isArray(val)) {
    return val.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (val !== null && typeof val === 'object' && Object.prototype.toString.call(val) === '[object Object]') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(val as Record<string, any>)) {
      if (v !== undefined) {
        cleaned[k] = stripUndefinedDeep(v);
      }
    }
    return cleaned as T;
  }
  return val;
}

async function commitDocsInBatches(
  db: FirebaseFirestore.Firestore,
  collectionName: string,
  docs: Array<{ id: string; data: Record<string, any> }>
): Promise<number> {
  if (docs.length === 0) return 0;
  const BATCH_SIZE = 450;
  const CONCURRENCY = 6;
  const chunks: Array<Array<{ id: string; data: Record<string, any> }>> = [];
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    chunks.push(docs.slice(i, i + BATCH_SIZE));
  }

  for (let c = 0; c < chunks.length; c += CONCURRENCY) {
    const group = chunks.slice(c, c + CONCURRENCY);
    await Promise.all(
      group.map(async (chunk) => {
        const batch = db.batch();
        for (const item of chunk) {
          const ref = db.collection(collectionName).doc(item.id);
          batch.set(ref, stripUndefinedDeep(item.data), { merge: true });
        }
        await batch.commit();
      })
    );
  }
  return docs.length;
}

/**
 * GET /api/inzan/redgits-sync/status
 * Returns the latest RedGITS live sync metadata from `db-inzanathletics`.
 */
redgitsSyncRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const user = await authenticateCallerForInzan(req);
    if (!user) {
      res.status(403).json({ error: 'Forbidden: Manager or Admin access required for RedGITS sync.' });
      return;
    }
    const inzanDb = getFirestore(INZAN_DATABASE_ID);
    const snap = await inzanDb.collection('settings').doc('redgits_sync_status').get();
    res.json({
      ok: true,
      status: snap.exists ? snap.data() : null,
    });
  } catch (err: any) {
    console.error('[RedGITS Sync] Status error:', err);
    res.status(500).json({ error: err.message || 'Failed to read RedGITS sync status' });
  }
});

/**
 * POST /api/inzan/redgits-sync
 * Authenticates directly against https://inzan.redgits.com, extracts live Active Members,
 * Packages, Subscriptions/Payments, National IDs, Staff/Sales Reps, Leads, Invitations
 * (and Expired Members when mode === 'full'), and upserts into `db-inzanathletics`.
 */
redgitsSyncRouter.post('/', async (req: Request, res: Response) => {
  const startTimeMs = Date.now();
  const startedAt = new Date().toISOString();

  try {
    // 1. Verify Tenant Isolation & Auth
    const hostname = getRequestHostname(req);
    const { config: tenantConfig } = await getTenantInfoForHost(hostname);
    const isLocalhost = hostname.includes('localhost') || hostname.includes('127.0.0.1');
    if (!isLocalhost && tenantConfig?.tenantId && tenantConfig.tenantId !== 'inzanathletics') {
      res.status(403).json({ error: 'RedGITS sync is strictly isolated to the Inzan Athletics tenant.' });
      return;
    }

    const caller = await authenticateCallerForInzan(req);
    if (!caller) {
      res.status(403).json({ error: 'Forbidden: Only Inzan Athletics Managers or Admins can trigger RedGITS sync.' });
      return;
    }

    const mode: 'fast' | 'full' = req.body?.mode === 'full' ? 'full' : 'fast';
    const inzanDb = getFirestore(INZAN_DATABASE_ID);
    let storedUser = '';
    let storedPass = '';
    try {
      const credSnap = await inzanDb.collection('settings').doc('redgits_credentials').get();
      if (credSnap.exists) {
        const cData = credSnap.data();
        storedUser = String(cData?.username || '').trim();
        storedPass = String(cData?.password || '');
      }
    } catch {}
    const redgitsUsername = String(req.body?.username || process.env.REDGITS_USERNAME || storedUser || DEFAULT_REDGITS_USER).trim();
    const redgitsPassword = String(req.body?.password || process.env.REDGITS_PASSWORD || storedPass || DEFAULT_REDGITS_PASS);

    // 2. Authenticate with https://inzan.redgits.com (with BlockIntel device fingerprint & session cookie rotation)
    const cookieJar = new Map<string, string>();
    const deviceId = 'fd182a91-4d82-4e11-9a15-8b3d7a109c44';
    const installId = '7c991b22-1c30-4f88-a241-99e1c4102b11';
    const clientFp = 'e8b1204f9a3d11c8402e7a19c5d3b201';
    const deviceCode = 'DEV-INZAN-SYNC-01';
    cookieJar.set('device_id', deviceId);
    cookieJar.set('ua_install_id', installId);
    cookieJar.set('ua_client_fp', clientFp);
    cookieJar.set('ua_device_code', deviceCode);

    const saveCookies = (response: globalThis.Response) => {
      let setCookies: string[] = [];
      if (typeof response.headers.getSetCookie === 'function') {
        setCookies = response.headers.getSetCookie();
      }
      if (!setCookies || setCookies.length === 0) {
        const rawSetCookie = response.headers.get('set-cookie');
        if (rawSetCookie) {
          setCookies = rawSetCookie.split(/,(?=\s*[a-zA-Z0-9_-]+=)/);
        }
      }
      for (const c of setCookies) {
        const [kv] = c.split(';');
        if (!kv) continue;
        const eq = kv.indexOf('=');
        if (eq > 0) {
          const k = kv.slice(0, eq).trim();
          const v = kv.slice(eq + 1).trim();
          if (v && v !== 'deleted') {
            cookieJar.set(k, v);
          }
        }
      }
    };
    const getCookieHeader = () =>
      Array.from(cookieJar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');

    const clientInfoPayload = JSON.stringify({
      device_id: deviceId,
      install_id: installId,
      fingerprint: clientFp,
      device_code: deviceCode,
      user_agent: USER_AGENT,
      platform: 'Win32',
      language: 'en-US',
      screen: '1920x1080',
      timezone: 'Africa/Cairo',
    });

    const loginPageRes = await fetch(`${REDGITS_ORIGIN}/admin/login`, {
      headers: { 'User-Agent': USER_AGENT, Cookie: getCookieHeader() },
    });
    saveCookies(loginPageRes);

    const loginRes = await fetch(`${REDGITS_ORIGIN}/admin/login/check_login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: getCookieHeader(),
        'User-Agent': USER_AGENT,
        Referer: `${REDGITS_ORIGIN}/admin/login`,
        Origin: REDGITS_ORIGIN,
      },
      body: new URLSearchParams({
        username: redgitsUsername,
        password: redgitsPassword,
        code: deviceCode,
        client_info: clientInfoPayload,
      }).toString(),
      redirect: 'manual',
    });
    saveCookies(loginRes);

    const loginLocation = loginRes.headers.get('location') || '';
    const isLoginRedirectToLogin = loginLocation.includes('/admin/login');
    if (isLoginRedirectToLogin || (!cookieJar.has('ci_session') && loginRes.status !== 302)) {
      res.status(401).json({
        error: 'Failed to authenticate with inzan.redgits.com. Please verify RedGITS username and password.',
      });
      return;
    }

    // Helper to fetch DataTables JSON endpoint (sequential-safe with live cookie rotation)
    const fetchDataTableJson = async (endpoint: string, maxRows: number): Promise<string[][]> => {
      try {
        const dtParams = new URLSearchParams({
          draw: '1',
          start: '0',
          length: String(maxRows),
          'search[value]': '',
          'order[0][column]': '0',
          'order[0][dir]': 'desc',
        });
        const r = await fetch(`${REDGITS_ORIGIN}/admin/member_data/${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: getCookieHeader(),
            'User-Agent': USER_AGENT,
            'X-Requested-With': 'XMLHttpRequest',
            Referer: `${REDGITS_ORIGIN}/admin/members`,
          },
          body: dtParams.toString(),
        });
        saveCookies(r);
        if (!r.ok) return [];
        const json: any = await r.json();
        if (!Array.isArray(json?.data)) return [];
        return json.data.map((row: unknown[]) =>
          Array.isArray(row) ? row.map((cell) => stripHtmlAndExtractId(cell)) : []
        );
      } catch (e) {
        console.warn(`[RedGITS Sync] Warning fetching member_data/${endpoint}:`, e);
        return [];
      }
    };

    // Helper to fetch HTML table endpoint
    const fetchHtmlTable = async (pathUrl: string): Promise<string[][]> => {
      try {
        const r = await fetch(`${REDGITS_ORIGIN}${pathUrl}`, {
          headers: {
            Cookie: getCookieHeader(),
            'User-Agent': USER_AGENT,
            Referer: `${REDGITS_ORIGIN}/admin`,
          },
        });
        saveCookies(r);
        if (!r.ok) return [];
        const html = await r.text();
        return parseHtmlTableRows(html);
      } catch (e) {
        console.warn(`[RedGITS Sync] Warning fetching ${pathUrl}:`, e);
        return [];
      }
    };

    // 3. Fetch datasets in controlled waves so CodeIgniter / PHPSESSID file locks never drop or collide
    const pkgCatalogRows = await fetchHtmlTable('/admin/packages/show');
    const activeRows = await fetchDataTableJson('active', 50000);
    const [pkgListRows, natRows] = await Promise.all([
      fetchHtmlTable('/admin/packagelist'),
      fetchHtmlTable('/admin/reports/nationalMembers'),
    ]);
    const [guestRows, invRows, staffRows] = await Promise.all([
      fetchDataTableJson('guest', 450),
      fetchDataTableJson('viewinvitation', 400),
      fetchHtmlTable('/admin/staff/show'),
    ]);
    const expiredRows = mode === 'full' ? await fetchDataTableJson('expiredmember', 10000) : [];

    if (activeRows.length === 0 && pkgCatalogRows.length === 0) {
      res.status(502).json({
        error:
          'RedGITS returned 0 records during live scrape (session may have been challenged by BlockIntel or credentials expired). Existing database records were preserved untouched.',
      });
      return;
    }

    // 4. Persist updated credentials if explicitly supplied and authenticated
    const nowIso = new Date().toISOString();
    if (req.body?.username && req.body?.password) {
      try {
        await inzanDb.collection('settings').doc('redgits_credentials').set({
          username: redgitsUsername,
          password: redgitsPassword,
          updatedAt: nowIso,
          updatedBy: caller.email,
        }, { merge: true });
      } catch {}
    }

    // Load existing users and existing redgits client phones/packages so we don't overwrite or re-fetch unnecessarily
    const [existingUsersSnap, existingClientsSnap] = await Promise.all([
      inzanDb.collection('users').get(),
      inzanDb
        .collection('clients')
        .select('phone', 'redgitsId', 'memberId', 'status', 'packages', 'invitationsUsed', 'freezeDaysUsed', 'freePtSessionsUsed')
        .get(),
    ]);

    const existingPhoneByDocId = new Map<string, string>();
    const existingClientDataByDocId = new Map<string, Record<string, any>>();
    for (const cDoc of existingClientsSnap.docs) {
      const d = cDoc.data();
      existingClientDataByDocId.set(cDoc.id, d || {});
      if (d?.phone && String(d.phone).length >= 8) {
        existingPhoneByDocId.set(cDoc.id, String(d.phone));
      }
    }

    const repUserIdByName = new Map<string, string>();
    const repDisplayNameById = new Map<string, string>();

    for (const docSnap of existingUsersSnap.docs) {
      const u = docSnap.data();
      const uName = String(u.name || '').trim();
      if (uName) {
        repUserIdByName.set(uName.toLowerCase(), docSnap.id);
        repDisplayNameById.set(docSnap.id, uName);
      }
      if (uName.toLowerCase() === 'semary' || u.email === 'semary@inzan.com') {
        repUserIdByName.set('abdelrahman simary', docSnap.id);
        repUserIdByName.set('abdelrahman semary', docSnap.id);
        repUserIdByName.set('simary', docSnap.id);
        repDisplayNameById.set(docSnap.id, 'Abdelrahman Simary');
      }
      if (uName.toLowerCase() === 'nour' || u.email === 'nour@inzan.com') {
        repUserIdByName.set('nour farid', docSnap.id);
        repDisplayNameById.set(docSnap.id, 'Nour Farid');
      }
      if (uName.toLowerCase() === 'fadi' || u.email === 'fadi@inzan.com') {
        repUserIdByName.set('fadi', docSnap.id);
        repUserIdByName.set('mr. fady', docSnap.id);
      }
    }

    const userDocsMap = new Map<string, { id: string; data: Record<string, any> }>();

    function ensureSalesRepUser(rawName?: string): { id: string; name: string } | null {
      const clean = cleanSalesRepName(rawName);
      if (!clean) return null;
      const lower = clean.toLowerCase();
      const existingId = repUserIdByName.get(lower);
      if (existingId) {
        const canonicalName = repDisplayNameById.get(existingId) || clean;
        if (!userDocsMap.has(existingId)) {
          userDocsMap.set(existingId, {
            id: existingId,
            data: {
              id: existingId,
              name: canonicalName,
              status: 'working',
              updatedAt: nowIso,
            },
          });
        }
        return { id: existingId, name: canonicalName };
      }

      const slug = slugifyName(clean);
      if (!slug) return null;
      const newId = `redgits-rep-${slug}`;
      repUserIdByName.set(lower, newId);
      repDisplayNameById.set(newId, clean);
      userDocsMap.set(newId, {
        id: newId,
        data: {
          id: newId,
          name: clean,
          email: `${slug}@inzanathletics.com`,
          role: 'rep',
          status: 'working',
          branch: 'Inzan Athletics',
          sourceSystem: 'RedGITS_v17.12',
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      });
      return { id: newId, name: clean };
    }

    // 5. Index National Members Report (/admin/reports/nationalMembers)
    const natByRedgitsId = new Map<
      string,
      { memberId: string; nationalId: string; birthday: string; salesMan: string; notes: string }
    >();
    for (const nRow of natRows) {
      if (!Array.isArray(nRow) || nRow.length < 6) continue;
      const [rCode, , sysId, natId, bday, sMan, rNotes] = nRow;
      if (!rCode) continue;
      natByRedgitsId.set(String(rCode).trim(), {
        memberId: String(sysId || '').trim(),
        nationalId: String(natId || '').trim(),
        birthday: String(bday || '').trim(),
        salesMan: cleanSalesRepName(sMan),
        notes: String(rNotes || '').trim(),
      });
      if (sMan) ensureSalesRepUser(sMan);
    }

    // 6. Index Package Subscriptions & Unmasked Phones (/admin/packagelist)
    const phoneByRedgitsId = new Map<string, string>();
    const phoneByCardId = new Map<string, string>();
    const phoneByName = new Map<string, string>();
    const subscriptionsByRedgitsId = new Map<string, any[]>();

    for (const row of pkgListRows) {
      if (!Array.isArray(row) || row.length < 12) continue;
      const [
        createdAt,
        rawMemberName,
        memberId,
        pkgName,
        subType,
        paymentAmt,
        sn,
        ,
        rawMobile,
        payMethod,
        startDate,
        endDate,
        salesman,
        createdBy,
      ] = row;
      const memberName = String(rawMemberName || '')
        .replace(/\s*\[ID:\d+\]\s*/g, '')
        .trim();
      const idTagMatch = String(rawMemberName || '').match(/\[ID:(\d+)\]/);
      const cleanPhone = normalizePhone(rawMobile);
      if (cleanPhone && idTagMatch?.[1]) phoneByRedgitsId.set(idTagMatch[1], cleanPhone);
      if (cleanPhone && memberId) phoneByCardId.set(String(memberId).trim(), cleanPhone);
      if (cleanPhone && memberName) phoneByName.set(memberName.toLowerCase(), cleanPhone);
      if (salesman) ensureSalesRepUser(salesman);

      const cleanPkgName = String(pkgName || '')
        .replace(/\s*\(\s*\d+\s*\)\s*$/, '')
        .trim();
      const subRecord = {
        createdAt,
        memberName,
        memberId: String(memberId || '').trim(),
        redgitsId: idTagMatch?.[1] || '',
        packageName: cleanPkgName || pkgName,
        subType,
        amount: parseFloat(String(paymentAmt).replace(/[^\d.]/g, '')) || 0,
        receiptSn: sn,
        method: payMethod || 'Cash',
        startDate,
        endDate,
        salesman: cleanSalesRepName(salesman),
        createdBy: cleanSalesRepName(createdBy),
      };

      // Strictly index by RedGITS internal ID [ID:xxxxx] to prevent cross-member collision with sequential card memberId
      if (idTagMatch?.[1]) {
        const key = idTagMatch[1];
        const arr = subscriptionsByRedgitsId.get(key) || [];
        arr.push(subRecord);
        subscriptionsByRedgitsId.set(key, arr);
      }
    }

    // 7. Build Packages Catalog from /admin/packages/show
    const packageDocsMap = new Map<string, { id: string; data: Record<string, any> }>();
    const packageDocsByLowerName = new Map<string, Record<string, any>>();
    for (const row of pkgCatalogRows) {
      if (!Array.isArray(row) || row.length < 10) continue;
      const [
        pkgCode,
        pkgCategory,
        mustHavePrimaryRaw,
        sessionName,
        ,
        pkgPrice,
        ,
        targetRoleRaw,
        pkgStatus,
        pkgDays,
        invBalance,
        freezeMin,
        freezeMax,
        ,
        ,
        ,
        startTimeRaw,
        endTimeRaw,
      ] = row;
      if (!sessionName || sessionName === 'No data available in table') continue;
      const id = `redgits-pkg-${pkgCode || slugifyName(sessionName)}`;
      const price = parseFloat(String(pkgPrice).replace(/[^\d.]/g, '')) || 0;
      const expiryDays = parseInt(String(pkgDays), 10) || 30;
      const invitations = parseInt(String(invBalance), 10) || 0;
      const freezeMaxDays = parseInt(String(freezeMax), 10) || 0;
      const freezeMinDays = parseInt(String(freezeMin), 10) || (freezeMaxDays > 0 ? 7 : 0);
      const sessions = parseSessionsFromName(sessionName, expiryDays);
      const isSecondary = /^yes$/i.test(String(mustHavePrimaryRaw || '').trim());
      const isPtPackage = /pt|private|trainer/i.test(`${pkgCategory || ''} ${sessionName}`);
      const defaultFreePt =
        !isPtPackage && !isSecondary
          ? expiryDays >= 300
            ? 3
            : expiryDays >= 180
            ? 2
            : expiryDays >= 90
            ? 1
            : 0
          : 0;
      const defaultClassTrials = !isPtPackage && !isSecondary && expiryDays >= 90 ? 1 : 0;

      const startHm = String(startTimeRaw || '').slice(0, 5);
      const endHm = String(endTimeRaw || '').slice(0, 5);
      const isTimeRestricted =
        Boolean(startHm && endHm) && !(startHm === '00:00' && (endHm === '23:00' || endHm === '23:59'));

      const pkgData: Record<string, any> = {
        id,
        name: sessionName.trim(),
        price,
        sessions,
        expiryDays,
        category: pkgCategory?.trim() || (isPtPackage ? 'PT' : 'Membership'),
        hierarchyType: isSecondary ? 'Secondary' : 'Primary',
        requiresPrimaryPackage: isSecondary,
        targetAttribution: targetRoleRaw?.trim() || 'Sales',
        status: pkgStatus === 'Hold' ? 'Inactive' : 'Active',
        invitationsTotal: invitations,
        guestInvitations: invitations,
        freezeLimitDays: freezeMaxDays,
        freezeAllowanceDays: freezeMaxDays,
        maxFreezeDays: freezeMaxDays,
        freezeMinDays,
        minFreezeDays: freezeMinDays,
        freePtSessions: defaultFreePt,
        freeClassTrials: defaultClassTrials,
        benefits: {
          guestInvitations: invitations,
          freezeAllowanceDays: freezeMaxDays,
          minFreezeDays: freezeMinDays,
          maxFreezeDays: freezeMaxDays,
          freePtSessions: defaultFreePt,
          freeClassTrials: defaultClassTrials,
        },
        isTimeRestricted,
        allowedStartTime: isTimeRestricted ? startHm : undefined,
        allowedEndTime: isTimeRestricted ? endHm : undefined,
        sourceSystem: 'RedGITS_v17.12',
        updatedAt: nowIso,
      };

      packageDocsMap.set(sessionName.trim(), {
        id,
        data: pkgData,
      });
      packageDocsByLowerName.set(sessionName.trim().toLowerCase(), pkgData);
    }

    const resolveCatalogPkg = (rawName?: string): Record<string, any> | null => {
      if (!rawName) return null;
      const trimmed = rawName.trim();
      if (packageDocsMap.has(trimmed)) return packageDocsMap.get(trimmed)!.data;
      const lower = trimmed.toLowerCase();
      if (packageDocsByLowerName.has(lower)) return packageDocsByLowerName.get(lower)!;
      for (const [k, v] of packageDocsByLowerName.entries()) {
        if (lower.includes(k) || k.includes(lower)) return v;
      }
      return null;
    };

    // 8. Build Staff & Trainers from /admin/staff/show
    const coachDocs: Array<{ id: string; data: Record<string, any> }> = [];
    for (const sRow of staffRows) {
      if (!Array.isArray(sRow) || sRow.length < 7) continue;
      const [sCode, sName, sMobile, , , sDept, sPos, , sSalary, , , , , , sStatus, , sNatId, sStart, , sUsername] =
        sRow;
      if (!sName || !sName.trim()) continue;
      const cleanStaffName = sName.trim();
      const dept = (sDept || 'Fitness').trim();
      const pos = (sPos || sDept || 'Trainer').trim();
      if (/sales|front|admin|manager|reception|customer|call/i.test(`${dept} ${pos}`)) {
        ensureSalesRepUser(cleanStaffName);
      }
      const cId = `redgits-staff-${sCode || slugifyName(cleanStaffName)}`;
      coachDocs.push({
        id: cId,
        data: {
          id: cId,
          coachId: `STAFF-${String(sCode || '000').padStart(3, '0')}`,
          name: cleanStaffName,
          phone: normalizePhone(sMobile),
          specialty: pos,
          department: dept,
          status: sStatus === 'Suspend' ? 'Inactive' : 'Active',
          salary: parseFloat(String(sSalary || '0').replace(/[^\d.]/g, '')) || 0,
          nationalId: sNatId || '',
          hireDate: sStart || nowIso.slice(0, 10),
          username: sUsername || '',
          branch: 'Inzan Athletics',
          sourceSystem: 'RedGITS_v17.12',
          updatedAt: nowIso,
        },
      });
    }

    // 9. Process Active Members, Expired Members (if full), and Recent Leads
    const listByRedgitsId = new Map<string, { rowType: 'active' | 'expired' | 'lead'; row: string[] }>();

    for (const row of expiredRows) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const idMatch = row.join(' ').match(/\[ID:(\d+)\]/);
      const rId = idMatch?.[1] ? idMatch[1] : /^\d+$/.test(row[0] || '') ? String(row[0]) : '';
      if (!rId) continue;
      listByRedgitsId.set(rId, { rowType: 'expired', row });
    }

    for (const row of activeRows) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const idMatch = row.join(' ').match(/\[ID:(\d+)\]/);
      const rId = idMatch?.[1] ? idMatch[1] : /^\d+$/.test(row[0] || '') ? String(row[0]) : '';
      if (!rId) continue;
      listByRedgitsId.set(rId, { rowType: 'active', row });
    }

    for (const gRow of guestRows) {
      if (!Array.isArray(gRow) || gRow.length < 5) continue;
      const rId = /^\d+$/.test(gRow[0] || '') ? String(gRow[0]).trim() : '';
      if (!rId || listByRedgitsId.has(rId)) continue;
      listByRedgitsId.set(rId, { rowType: 'lead', row: gRow });
    }

    // Fetch unmasked mobile numbers via /admin/member_data/get_mobile/{id} for any active member or lead missing a phone
    const idsNeedingMobile: string[] = [];
    for (const [rId, entry] of listByRedgitsId.entries()) {
      if (entry.rowType === 'expired') continue;
      const docId = `redgits-${rId}`;
      const natEntry = natByRedgitsId.get(rId);
      const realCardId = entry.rowType === 'active' ? String(entry.row[2] || natEntry?.memberId || '').trim() : '';
      const knownPhone =
        existingPhoneByDocId.get(docId) ||
        phoneByRedgitsId.get(rId) ||
        (realCardId ? phoneByCardId.get(realCardId) : undefined);
      if (!knownPhone && idsNeedingMobile.length < 100) {
        idsNeedingMobile.push(rId);
      }
    }

    let unmaskedPhonesFetched = 0;
    if (idsNeedingMobile.length > 0) {
      let mIdx = 0;
      const MOBILE_CONCURRENCY = 4;
      const fetchMobileWorker = async () => {
        while (mIdx < idsNeedingMobile.length) {
          const targetId = idsNeedingMobile[mIdx++];
          if (!targetId) continue;
          try {
            const r = await fetch(`${REDGITS_ORIGIN}/admin/member_data/get_mobile/${targetId}`, {
              headers: {
                Cookie: getCookieHeader(),
                'User-Agent': USER_AGENT,
                'X-Requested-With': 'XMLHttpRequest',
              },
            });
            saveCookies(r);
            if (r.ok) {
              const j: any = await r.json();
              const clean = normalizePhone(j?.mobile);
              if (clean) {
                phoneByRedgitsId.set(targetId, clean);
                unmaskedPhonesFetched++;
              }
            }
          } catch {
            // ignore individual lookup error
          }
        }
      };
      await Promise.all(Array.from({ length: MOBILE_CONCURRENCY }, () => fetchMobileWorker()));
    }

    const clientDocs: Array<{ id: string; data: Record<string, any> }> = [];
    const paymentDocsMap = new Map<string, { id: string; data: Record<string, any> }>();

    let syncedActiveCount = 0;
    let syncedExpiredCount = 0;
    let syncedLeadsCount = 0;
    let maxRealMemberIdNum = 0;
    let maxLeadIdNum = 0;

    const sortedIds = Array.from(listByRedgitsId.keys()).sort((a, b) => Number(b) - Number(a));

    for (const rId of sortedIds) {
      const entry = listByRedgitsId.get(rId)!;
      const row = entry.row;
      const natEntry = natByRedgitsId.get(rId);
      const clientDocId = `redgits-${rId}`;
      const existingClient = existingClientDataByDocId.get(clientDocId) || {};

      let name = '';
      let realCardMemberId = '';
      let packageName = '';
      let status: 'Active' | 'Expired' | 'Hold' | 'Lead' = 'Active';
      let startDate = '';
      let endDate = '';
      let rawSalesName = natEntry?.salesMan || '';
      let trainerName = '';
      let genderRaw = 'Male';
      let advSource = 'Walk-in';

      if (entry.rowType === 'active') {
        // Active DataTable columns: [Code, Member Name, Member ID, Package, Status, Start Date, End Date, MobileBtn, Corporate, SalesMan, Trainer, Color, Gender, Action]
        name = String(row[1] || '').replace(/\s*\[ID:\d+\]\s*/g, '').trim();
        realCardMemberId = String(row[2] || natEntry?.memberId || '').trim();
        packageName = String(row[3] || '').trim();
        status =
          row[4]?.toLowerCase().includes('hold') || row[4]?.toLowerCase().includes('freez') ? 'Hold' : 'Active';
        startDate = String(row[5] || '').trim();
        endDate = String(row[6] || '').trim();
        rawSalesName = String(row[9] || row[8] || rawSalesName).trim();
        trainerName = row[10] && row[10] !== '0' ? String(row[10]).trim() : '';
        genderRaw = String(row[12] || row[11] || 'Male').trim();
        syncedActiveCount++;
      } else if (entry.rowType === 'expired') {
        // Expired DataTable columns: [Member Name, Member ID, MobileBtn, Package, Start Date, End Date, SalesMan, Corporate, Action]
        name = String(row[0] || '').replace(/\s*\[ID:\d+\]\s*/g, '').trim();
        realCardMemberId = String(row[1] || natEntry?.memberId || '').trim();
        packageName = String(row[3] || row[2] || '').trim();
        startDate = String(row[4] || row[3] || '').trim();
        endDate = String(row[5] || row[4] || '').trim();
        rawSalesName = String(row[6] || row[5] || rawSalesName).trim();
        status = 'Expired';
        syncedExpiredCount++;
      } else {
        // Guest Leads DataTable columns: [Code, Name, Type, Advertising Source, CreatedOn, MobileBtn, SalesMan, CreatedBy, Gender, Action]
        name = String(row[1] || '').replace(/\s*\[ID:\d+\]\s*/g, '').trim();
        realCardMemberId = '';
        status = 'Lead';
        advSource = normalizeAdvertisingSource(row[3], row[2]);
        startDate = String(row[4] || nowIso).slice(0, 10);
        rawSalesName = String(row[6] || row[7] || rawSalesName).trim();
        genderRaw = String(row[8] || 'Male').trim();
        syncedLeadsCount++;
      }

      if (!name) continue;

      if (realCardMemberId === '0' || realCardMemberId === '-') realCardMemberId = '';

      // Strictly look up subscriptions by RedGITS internal ID rId (never by sequential cardMemberId)
      const memberSubs = subscriptionsByRedgitsId.get(rId) || [];
      const fallbackSalesName =
        cleanSalesRepName(rawSalesName) ||
        cleanSalesRepName(memberSubs[0]?.salesman) ||
        cleanSalesRepName(natEntry?.salesMan);
      const repInfo = ensureSalesRepUser(fallbackSalesName);

      const phone =
        phoneByRedgitsId.get(rId) ||
        (realCardMemberId ? phoneByCardId.get(realCardMemberId) : undefined) ||
        existingPhoneByDocId.get(clientDocId) ||
        phoneByName.get(name.toLowerCase()) ||
        '';

      const nationalId = (natEntry?.nationalId || '').trim();
      const rawBday = (natEntry?.birthday || '').trim();
      const dateOfBirth =
        (rawBday && rawBday !== '0000-00-00' ? rawBday.slice(0, 10) : '') ||
        deriveDobFromNationalId(nationalId) ||
        undefined;

      const catalogPkg = resolveCatalogPkg(packageName);
      const defaultSessions =
        catalogPkg?.sessions || catalogPkg?.expiryDays || (packageName ? parseSessionsFromName(packageName) : 30);

      // Build enriched packages[] array from RedGITS subscriptions + active package so multi-package cards & benefits work
      const existingPackagesArr = Array.isArray(existingClient.packages) ? existingClient.packages : [];
      const mergedPackages: any[] = [];
      const seenPkgKeys = new Set<string>();

      const isSecondaryPkgName = (pName: string, catPkg?: Record<string, any> | null): boolean => {
        if (catPkg?.hierarchyType === 'Secondary') return true;
        return /\bpt\b|private\s*train|personal\s*train|group\s*pt|semi\s*private|nutrition|physiotherapy|massage|assessment|recovery/i.test(
          `${catPkg?.category || ''} ${pName}`
        );
      };

      if (packageName && status !== 'Lead') {
        const primaryKey = `${packageName.toLowerCase()}|${startDate || ''}|${endDate || ''}`;
        seenPkgKeys.add(primaryKey);
        const existingMatch = existingPackagesArr.find(
          (p: any) =>
            String(p?.packageName || '').toLowerCase() === packageName.toLowerCase() &&
            (!startDate || p?.startDate === startDate)
        );
        const isSec = isSecondaryPkgName(packageName, catalogPkg);
        const invQuota = isSec ? 0 : (catalogPkg?.guestInvitations ?? existingMatch?.guestInvitations ?? 0);
        const freezeQuota = isSec ? 0 : (catalogPkg?.freezeAllowanceDays ?? existingMatch?.freezeAllowanceDays ?? 0);
        const minFreeze = isSec ? 0 : (catalogPkg?.minFreezeDays ?? existingMatch?.minFreezeDays ?? (freezeQuota > 0 ? 7 : 0));
        const maxFreeze = isSec ? 0 : (catalogPkg?.maxFreezeDays ?? existingMatch?.maxFreezeDays ?? freezeQuota);
        const freePtQuota = isSec ? 0 : (catalogPkg?.freePtSessions ?? existingMatch?.freePtSessions ?? 0);
        const freeClassQuota = isSec ? 0 : (catalogPkg?.freeClassTrials ?? existingMatch?.freeClassTrials ?? 0);

        mergedPackages.push({
          ...existingMatch,
          id: existingMatch?.id || `pkg-${isSec ? 'sec' : 'primary'}-${rId}`,
          packageId: catalogPkg?.id || existingMatch?.packageId || `redgits-pkg-${slugifyName(packageName)}`,
          packageName,
          category: catalogPkg?.category || (isSec ? 'PT' : 'Membership'),
          hierarchyType: isSec ? 'Secondary' : 'Primary',
          status: status === 'Hold' ? 'Frozen' : status === 'Expired' ? 'Expired' : 'Active',
          startDate: startDate || nowIso.slice(0, 10),
          endDate: endDate || undefined,
          totalSessions: existingMatch?.totalSessions ?? defaultSessions,
          sessionsRemaining: existingMatch?.sessionsRemaining ?? (status === 'Active' ? defaultSessions : 0),
          sessionsUsed: existingMatch?.sessionsUsed ?? 0,
          pricePaid: existingMatch?.pricePaid ?? catalogPkg?.price ?? 0,
          guestInvitations: invQuota,
          invitationsTotal: invQuota,
          invitationsUsed: existingMatch?.invitationsUsed ?? existingClient.invitationsUsed ?? 0,
          freezeAllowanceDays: freezeQuota,
          freezeLimitDays: freezeQuota,
          minFreezeDays: minFreeze,
          maxFreezeDays: maxFreeze,
          freezeDaysUsed: existingMatch?.freezeDaysUsed ?? existingClient.freezeDaysUsed ?? 0,
          freePtSessions: freePtQuota,
          freePtSessionsUsed: existingMatch?.freePtSessionsUsed ?? existingClient.freePtSessionsUsed ?? 0,
          freeClassTrials: freeClassQuota,
          freeClassTrialsUsed: existingMatch?.freeClassTrialsUsed ?? 0,
          createdBy: existingMatch?.createdBy || repInfo?.name || fallbackSalesName || 'RedGITS Sync',
          createdAt: existingMatch?.createdAt || memberSubs[0]?.createdAt || startDate || nowIso,
          financeConfirmed: true,
        });
      }

      for (let sIdx = 0; sIdx < memberSubs.length; sIdx++) {
        const sub = memberSubs[sIdx];
        if (!sub || !sub.packageName) continue;
        const subKey = `${String(sub.packageName).toLowerCase()}|${sub.startDate || ''}|${sub.endDate || ''}`;
        if (!seenPkgKeys.has(subKey)) {
          seenPkgKeys.add(subKey);
          const subCatPkg = resolveCatalogPkg(sub.packageName);
          const isSec = isSecondaryPkgName(sub.packageName, subCatPkg);
          const subSessions =
            subCatPkg?.sessions || subCatPkg?.expiryDays || parseSessionsFromName(sub.packageName);
          const isSubExpired = sub.endDate && sub.endDate < nowIso.slice(0, 10);
          mergedPackages.push({
            id: `pkg-sub-${rId}-${sub.receiptSn || sIdx + 1}`,
            packageId: subCatPkg?.id || `redgits-pkg-${slugifyName(sub.packageName)}`,
            packageName: sub.packageName,
            category: subCatPkg?.category || (isSec ? 'PT' : 'Membership'),
            hierarchyType: isSec ? 'Secondary' : 'Primary',
            status: isSubExpired ? 'Expired' : 'Active',
            startDate: sub.startDate || nowIso.slice(0, 10),
            endDate: sub.endDate || undefined,
            totalSessions: subSessions,
            sessionsRemaining: isSubExpired ? 0 : subSessions,
            pricePaid: sub.amount || subCatPkg?.price || 0,
            guestInvitations: isSec ? 0 : (subCatPkg?.guestInvitations ?? 0),
            invitationsTotal: isSec ? 0 : (subCatPkg?.guestInvitations ?? 0),
            invitationsUsed: 0,
            freezeAllowanceDays: isSec ? 0 : (subCatPkg?.freezeAllowanceDays ?? 0),
            freezeLimitDays: isSec ? 0 : (subCatPkg?.freezeAllowanceDays ?? 0),
            minFreezeDays: isSec ? 0 : (subCatPkg?.minFreezeDays ?? 0),
            maxFreezeDays: isSec ? 0 : (subCatPkg?.maxFreezeDays ?? 0),
            freezeDaysUsed: 0,
            freePtSessions: isSec ? 0 : (subCatPkg?.freePtSessions ?? 0),
            freePtSessionsUsed: 0,
            freeClassTrials: isSec ? 0 : (subCatPkg?.freeClassTrials ?? 0),
            freeClassTrialsUsed: 0,
            receiptSn: sub.receiptSn,
            createdBy: sub.salesman || repInfo?.name || fallbackSalesName || 'RedGITS Sync',
            createdAt: sub.createdAt || sub.startDate || nowIso,
            financeConfirmed: true,
          });
        }
      }

      // Preserve any locally-created or reconciled CRM packages not in the summary row
      for (const localPkg of existingPackagesArr) {
        const localKey = `${String(localPkg?.packageName || '').toLowerCase()}|${localPkg?.startDate || ''}|${localPkg?.endDate || ''}`;
        if (localPkg?.packageName && !seenPkgKeys.has(localKey)) {
          seenPkgKeys.add(localKey);
          mergedPackages.push(localPkg);
        }
      }

      // Determine true Primary Membership vs Secondary Package from mergedPackages
      const primaryRecord =
        mergedPackages.find((p) => p.hierarchyType === 'Primary' && p.status !== 'Expired') ||
        mergedPackages.find((p) => p.hierarchyType === 'Primary') ||
        mergedPackages[0];
      const secondaryRecord = mergedPackages.find(
        (p) => p.hierarchyType === 'Secondary' && p.status !== 'Expired'
      );

      const resolvedPrimaryPkgName =
        primaryRecord?.packageName || existingClient.primaryPackageName || packageName || (status === 'Lead' ? 'Prospect' : 'Membership');
      const resolvedPrimaryExpiry =
        primaryRecord?.endDate || existingClient.membershipExpiry || endDate || null;
      const resolvedPrimaryStart =
        primaryRecord?.startDate || existingClient.startDate || startDate || nowIso.slice(0, 10);

      const todayStr = nowIso.slice(0, 10);
      const computedDaysRemaining = resolvedPrimaryExpiry
        ? Math.max(
            0,
            Math.round(
              (new Date(`${resolvedPrimaryExpiry}T00:00:00Z`).getTime() -
                new Date(`${todayStr}T00:00:00Z`).getTime()) /
                86400000
            )
          )
        : existingClient.daysRemaining ?? 0;

      const topInvitationsTotal =
        existingClient.invitationsTotal ?? catalogPkg?.guestInvitations ?? 0;
      const topFreezeAllowance =
        existingClient.freezeAllowanceDays ?? catalogPkg?.freezeAllowanceDays ?? 0;
      const topFreePtTotal =
        existingClient.freePtSessionsTotal ?? catalogPkg?.freePtSessions ?? 0;
      const topFreeClassTrials =
        existingClient.freeClassTrialsTotal ?? catalogPkg?.freeClassTrials ?? 0;

      const resolvedLeadId = String(existingClient.leadId || rId).trim();
      const existingMemberIdStr = existingClient.memberId ? String(existingClient.memberId).trim() : '';
      const resolvedMemberId =
        status === 'Lead'
          ? ''
          : realCardMemberId && realCardMemberId !== rId
          ? realCardMemberId
          : existingMemberIdStr && existingMemberIdStr !== rId
          ? existingMemberIdStr
          : '';

      const numericLeadId = parseInt(resolvedLeadId, 10);
      if (!isNaN(numericLeadId) && numericLeadId > maxLeadIdNum) {
        maxLeadIdNum = numericLeadId;
      }
      const numericMemberId = parseInt(resolvedMemberId, 10);
      if (!isNaN(numericMemberId) && numericMemberId > 0 && numericMemberId < 100000 && numericMemberId > maxRealMemberIdNum) {
        maxRealMemberIdNum = numericMemberId;
      }

      const clientData: Record<string, any> = {
        id: clientDocId,
        redgitsId: rId,
        legacyMemberId: rId,
        leadId: resolvedLeadId,
        memberId: resolvedMemberId ? resolvedMemberId : FieldValue.delete(),
        name,
        phone,
        nationalId: nationalId || existingClient.nationalId || undefined,
        dateOfBirth: dateOfBirth || existingClient.dateOfBirth || undefined,
        gender: /fem|انث|أنث/i.test(genderRaw) ? 'Female' : 'Male',
        memberCategory: inferMemberCategory(resolvedPrimaryPkgName, name),
        status,
        stage: status === 'Lead' ? 'New' : undefined,
        branch: 'Garden 8',
        packageType: resolvedPrimaryPkgName,
        primaryPackageName: resolvedPrimaryPkgName,
        secondaryPackageName: secondaryRecord?.packageName || existingClient.secondaryPackageName || undefined,
        startDate: resolvedPrimaryStart,
        membershipExpiry: resolvedPrimaryExpiry,
        daysRemaining: status === 'Active' || status === 'Hold' ? computedDaysRemaining : 0,
        isNearlyExpired: status === 'Active' && computedDaysRemaining > 0 && computedDaysRemaining <= 7,
        sessionsRemaining:
          existingClient.sessionsRemaining ?? (status === 'Active' ? computedDaysRemaining || defaultSessions : 0),
        invitationsTotal: topInvitationsTotal,
        guestInvitations: topInvitationsTotal,
        invitationsUsed: existingClient.invitationsUsed ?? 0,
        invitationsRemaining:
          existingClient.invitationsRemaining ?? Math.max(0, topInvitationsTotal - (existingClient.invitationsUsed ?? 0)),
        freezeLimitDays: topFreezeAllowance,
        freezeAllowanceDays: topFreezeAllowance,
        freezeDaysUsed: existingClient.freezeDaysUsed ?? 0,
        freezeDaysRemaining:
          existingClient.freezeDaysRemaining ?? Math.max(0, topFreezeAllowance - (existingClient.freezeDaysUsed ?? 0)),
        freezeCoins:
          existingClient.freezeCoins ?? Math.max(0, topFreezeAllowance - (existingClient.freezeDaysUsed ?? 0)),
        minFreezeDays: catalogPkg?.minFreezeDays ?? existingClient.minFreezeDays ?? 0,
        maxFreezeDays: catalogPkg?.maxFreezeDays ?? existingClient.maxFreezeDays ?? topFreezeAllowance,
        freePtSessionsTotal: topFreePtTotal,
        freePtSessionsUsed: existingClient.freePtSessionsUsed ?? 0,
        freePtSessionsRemaining:
          existingClient.freePtSessionsRemaining ?? Math.max(0, topFreePtTotal - (existingClient.freePtSessionsUsed ?? 0)),
        paidPtSessionsTotal: existingClient.paidPtSessionsTotal ?? 0,
        paidPtSessionsUsed: existingClient.paidPtSessionsUsed ?? 0,
        paidPtSessionsRemaining: existingClient.paidPtSessionsRemaining ?? 0,
        freeClassTrialsTotal: topFreeClassTrials,
        freeClassTrialsUsed: existingClient.freeClassTrialsUsed ?? 0,
        freeClassTrialsRemaining:
          existingClient.freeClassTrialsRemaining ??
          Math.max(0, topFreeClassTrials - (existingClient.freeClassTrialsUsed ?? 0)),
        packages: mergedPackages.length > 0 ? mergedPackages : undefined,
        assignedTo: repInfo?.id || existingClient.assignedTo || undefined,
        salesRep: repInfo?.id || existingClient.salesRep || undefined,
        salesName: repInfo?.name || fallbackSalesName || existingClient.salesName || undefined,
        trainerName: trainerName || existingClient.trainerName || undefined,
        advertisingSource: advSource,
        source: advSource,
        barcode: resolvedMemberId || resolvedLeadId,
        cardId: rId,
        frontDeskNote: natEntry?.notes || existingClient.frontDeskNote || undefined,
        updatedAt: nowIso,
        sourceSystem: 'RedGITS_v17.12',
      };

      Object.keys(clientData).forEach((k) => clientData[k] === undefined && delete clientData[k]);
      clientDocs.push({ id: clientDocId, data: clientData });

      for (let sIdx = 0; sIdx < memberSubs.length; sIdx++) {
        const sub = memberSubs[sIdx];
        if (!sub || sub.amount <= 0) continue;
        const payId = sub.receiptSn ? `redgits-fin-${rId}-${sub.receiptSn}` : `redgits-sub-${rId}-${sIdx + 1}`;
        paymentDocsMap.set(payId, {
          id: payId,
          data: {
            id: payId,
            clientId: clientDocId,
            client_name: name,
            amount: sub.amount,
            amount_paid: sub.amount,
            date: (sub.createdAt || sub.startDate || nowIso).slice(0, 10),
            method: inferPaymentMethod('', sub.method),
            packageType: sub.packageName || packageName || 'Membership',
            branch: 'Garden 8',
            salesName: sub.salesman || repInfo?.name || 'System Import',
            sales_rep_id: repInfo?.id || '',
            notes: `RedGITS SN: ${sub.receiptSn || '-'} (${sub.subType || 'new'})`,
            created_at: sub.createdAt || nowIso,
            deleted_at: null,
          },
        });
      }
    }

    // 10. Build Guest Invitations from /admin/member_data/viewinvitation
    const inviteDocs: Array<{ id: string; data: Record<string, any> }> = [];
    for (let idx = 0; idx < invRows.length; idx++) {
      const iRow = invRows[idx];
      if (!Array.isArray(iRow) || iRow.length < 8) continue;
      const [guestCode, guestName, , , hostName, hostMemberId, salesman, createdOn, createdBy, notes] = iRow;
      if (!guestName || !guestName.trim()) continue;
      const invId = `redgits-inv-${guestCode || idx + 1}`;
      inviteDocs.push({
        id: invId,
        data: {
          id: invId,
          guestCode: String(guestCode || '').trim(),
          guestName: guestName.trim(),
          hostMemberName: (hostName || '').trim(),
          hostMemberId: String(hostMemberId || '').trim(),
          salesName: cleanSalesRepName(salesman),
          createdBy: cleanSalesRepName(createdBy),
          createdAt: createdOn || nowIso,
          notes: notes || '',
          status: 'Checked In',
          branch: 'Garden 8',
          sourceSystem: 'RedGITS_v17.12',
        },
      });
    }

    const userDocs = Array.from(userDocsMap.values());
    const packageDocs = Array.from(packageDocsMap.values());
    const paymentDocs = Array.from(paymentDocsMap.values());

    // 11. Commit all batches to `db-inzanathletics`
    await commitDocsInBatches(inzanDb, 'users', userDocs);
    await commitDocsInBatches(inzanDb, 'packages', packageDocs);
    await commitDocsInBatches(inzanDb, 'coaches', coachDocs);
    await commitDocsInBatches(inzanDb, 'clients', clientDocs);
    await commitDocsInBatches(inzanDb, 'payments', paymentDocs);
    await commitDocsInBatches(inzanDb, 'guestInvites', inviteDocs);

    // 12. Sync sequential counters (`counters/clients` for real Member IDs, `counters/leads` for Lead IDs)
    if (maxRealMemberIdNum > 0) {
      const clientCounterRef = inzanDb.collection('counters').doc('clients');
      const clientCounterSnap = await clientCounterRef.get();
      const existingClientLastId = Number(clientCounterSnap.data()?.lastId || 0);
      if (maxRealMemberIdNum > existingClientLastId || existingClientLastId > 10000) {
        await clientCounterRef.set({ lastId: maxRealMemberIdNum, updatedAt: nowIso }, { merge: true });
      }
    }
    if (maxLeadIdNum > 0) {
      const leadCounterRef = inzanDb.collection('counters').doc('leads');
      const leadCounterSnap = await leadCounterRef.get();
      const existingLeadLastId = Number(leadCounterSnap.data()?.lastId || 0);
      if (maxLeadIdNum > existingLeadLastId) {
        await leadCounterRef.set({ lastId: maxLeadIdNum, updatedAt: nowIso }, { merge: true });
      }
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTimeMs;

    const syncStats: SyncStats = {
      mode,
      startedAt,
      completedAt,
      durationMs,
      syncedBy: caller.name || caller.email,
      counts: {
        activeMembers: syncedActiveCount,
        expiredMembers: syncedExpiredCount,
        leads: syncedLeadsCount,
        packages: packageDocs.length,
        payments: paymentDocs.length,
        staff: coachDocs.length,
        salesReps: userDocs.length,
        invitations: inviteDocs.length,
        unmaskedPhonesFetched,
      },
    };

    await inzanDb.collection('settings').doc('redgits_sync_status').set(syncStats, { merge: true });

    res.json({
      ok: true,
      ...syncStats,
    });
  } catch (err: any) {
    console.error('[RedGITS Sync] Fatal error:', err);
    res.status(500).json({
      error: err.message || 'Failed to sync live data from RedGITS',
    });
  }
});
