import { Router, Request, Response } from 'express';
import admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { getRequestHostname, getTenantInfoForHost } from '../utils/tenantDb.js';

export const redgitsSyncRouter = Router();

const INZAN_DATABASE_ID = 'db-inzanathletics';
const REDGITS_ORIGIN = 'https://inzan.redgits.com';
const DEFAULT_REDGITS_USER = process.env.REDGITS_USERNAME || 'mi5a';
const DEFAULT_REDGITS_PASS = process.env.REDGITS_PASSWORD || 'Miko0019_!';
const FALLBACK_REDGITS_USER = 'trasnfer';
const FALLBACK_REDGITS_PASS = '12122020Aa$';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

interface SyncStats {
  mode: 'fast' | 'full';
  startedAt: string;
  completedAt: string;
  lastSyncAt?: string;
  syncedAt?: string;
  durationMs: number;
  syncedBy: string;
  lastSyncBy?: string;
  status?: 'completed';
  mobileLookupsDeferred?: number;
  redgitsAccountUsed?: string;
  counts: {
    activeMembers: number;
    expiredMembers: number;
    leads: number;
    packages: number;
    payments: number;
    staff: number;
    salesReps: number;
    invitations: number;
    checkIns?: number;
    unmaskedPhonesFetched: number;
  };
}

function normalizePhone(raw?: string): string {
  if (!raw) return '';
  const str = String(raw).trim();
  if (str.includes('*') || str === 'NOT ALLOWED') return '';
  const digits = str.replace(/[^\d]/g, '');
  if (!digits || digits.length < 8) return '';
  if (/^(20)?0?1[0125]0{8,}$/.test(digits) || /^0{8,}$/.test(digits)) return '';
  if (digits.startsWith('2001') && digits.length === 13) return digits.slice(2);
  if (digits.startsWith('201') && (digits.length === 12 || digits.length === 11)) return '0' + digits.slice(2);
  if (digits.startsWith('1') && digits.length === 10) return '0' + digits;
  return digits;
}

function simpleHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return String(hash);
}

async function authenticateRedgitsWithBrowser(
  accounts: Array<{ username: string; password: string }>,
  cookieJar: Map<string, string>
): Promise<string> {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: 'en-US',
      timezoneId: 'Africa/Cairo',
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();

    for (const account of accounts) {
      try {
        await page.goto(`${REDGITS_ORIGIN}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await page.locator('#username').waitFor({ state: 'visible', timeout: 15_000 });
        await page.locator('#username').fill(account.username);
        await page.locator('#password').fill(account.password);
        await page.locator('#login-form button[type="submit"]').click();
        await page.waitForURL((url) => !url.pathname.includes('/admin/login'), { timeout: 20_000 });

        for (const cookie of await context.cookies(REDGITS_ORIGIN)) {
          if (cookie.value && cookie.value !== 'deleted') cookieJar.set(cookie.name, cookie.value);
        }
        return account.username;
      } catch (error) {
        console.warn(
          `[RedGITS Sync] Browser login rejected for account "${account.username}":`,
          error instanceof Error ? error.message : error
        );
      }
    }
    return '';
  } finally {
    await browser.close();
  }
}

function cleanMemberId(raw?: string, rId?: string): string {
  if (!raw) return '';
  const s = String(raw)
    .replace(/\[ID:\d+\]/g, '')
    .trim();
  if (!s || s === '0' || s === '-' || s.toLowerCase() === 'null' || s.toLowerCase() === 'none') return '';
  if (/^code\s*\(/i.test(s)) return '';
  if (rId && s === String(rId).trim() && Number(rId) >= 10000) return '';
  const prefixMatch = s.match(/^([qcpo])\s*-?\s*(\d+)$/i);
  if (prefixMatch && prefixMatch[1] && prefixMatch[2]) {
    return `${prefixMatch[1].toUpperCase()}${prefixMatch[2]}`;
  }
  return s;
}

function getMemberCodeGroupMeta(memberId?: string): { prefix: string; group: string } | null {
  if (!memberId) return null;
  const m = String(memberId).trim().match(/^([QCPO])\d+$/i);
  if (!m || !m[1]) return null;
  const p = m[1].toUpperCase();
  if (p === 'Q') return { prefix: 'Q', group: 'SGF / Kickboxing Member' };
  if (p === 'C') return { prefix: 'C', group: 'Cure Clinic Clients (Physiotherapy)' };
  if (p === 'P') return { prefix: 'P', group: 'Partners & Gym Owners Family' };
  if (p === 'O') return { prefix: 'O', group: 'Youth Clients (PT Youth & Classes)' };
  return null;
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
    let userData: FirebaseFirestore.DocumentData | null = userSnap.exists ? userSnap.data() || null : null;
    // Fallback: some staff docs were created with a non-UID document ID — resolve by email instead.
    if (!userData && email) {
      const byEmail = await inzanDb.collection('users').where('email', '==', email).limit(1).get();
      if (!byEmail.empty) userData = byEmail.docs[0]!.data();
    }
    // Custom claims are only trusted when they were issued for this tenant.
    const claimRole = decoded.tenantId === 'inzanathletics' ? String(decoded.role || '') : '';
    const role = String(userData?.role || claimRole || (email === 'michaelmitry13@gmail.com' ? 'crm_admin' : ''));
    const allowedRoles = ['admin', 'crm_admin', 'super_admin', 'manager'];

    if (
      allowedRoles.includes(role) ||
      email === 'michaelmitry13@gmail.com' ||
      email === 'magd.gallab@gmail.com'
    ) {
      return {
        uid: decoded.uid,
        email,
        name: String(userData?.name || (decoded as any).name || email || 'Admin'),
        role: role || 'admin',
      };
    }
    console.warn(`[RedGITS Sync] Access denied for ${email || decoded.uid} (role: "${role || 'none'}")`);
    return null;
  } catch (authErr: any) {
    console.warn('[RedGITS Sync] Caller token verification failed:', authErr?.message || authErr);
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
    let storedFallbackUser = '';
    let storedFallbackPass = '';
    try {
      const credSnap = await inzanDb.collection('settings').doc('redgits_credentials').get();
      if (credSnap.exists) {
        const cData = credSnap.data();
        storedUser = String(cData?.username || '').trim();
        storedPass = String(cData?.password || '');
        storedFallbackUser = String(cData?.fallbackUsername || '').trim();
        storedFallbackPass = String(cData?.fallbackPassword || '');
      }
    } catch {}
    const primaryUsername = String(req.body?.username || process.env.REDGITS_USERNAME || storedUser || DEFAULT_REDGITS_USER).trim();
    const primaryPassword = String(req.body?.password || process.env.REDGITS_PASSWORD || storedPass || DEFAULT_REDGITS_PASS);

    const candidateAccounts: Array<{ username: string; password: string }> = [];
    const addCandidate = (u: string, p: string) => {
      const cleanU = u.trim();
      if (!cleanU || !p) return;
      if (!candidateAccounts.some((a) => a.username === cleanU && a.password === p)) {
        candidateAccounts.push({ username: cleanU, password: p });
      }
    };
    addCandidate(primaryUsername, primaryPassword);
    addCandidate(DEFAULT_REDGITS_USER, DEFAULT_REDGITS_PASS);
    addCandidate(storedFallbackUser || FALLBACK_REDGITS_USER, storedFallbackPass || FALLBACK_REDGITS_PASS);

    // 2. Authenticate with https://inzan.redgits.com (with BlockIntel device fingerprint & session cookie rotation)
    const cookieJar = new Map<string, string>();
    const installId = randomUUID();
    const deviceId = installId;
    const fingerprintParts = [
      '',
      '',
      '',
      '',
      '',
      '1920x1080',
      '1',
      '24',
      'Africa/Cairo',
      'Win32',
      '8',
      '',
      'en-US, en',
      '0',
      'Google Inc.',
    ];
    const clientFp = simpleHash(fingerprintParts.join('|'));
    const deviceCode = clientFp;
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
      installId,
      platform: 'Win32',
      cpuCores: 8,
      deviceMemory: '',
      languages: 'en-US, en',
      timezone: 'Africa/Cairo',
      screen: '1920x1080',
      pixelRatio: '1',
      colorDepth: 24,
      vendor: 'Google Inc.',
      touchPoints: 0,
      userAgent: USER_AGENT,
      localIps: [],
      connection: '',
      canvasHash: '',
      webglHash: '',
      audioHash: '',
      deviceCode,
      fingerprintHash: clientFp,
      webglVendor: '',
      webglRenderer: '',
      cookieEnabled: true,
      online: true,
      uaBrands: '',
      uaPlatform: 'Windows',
      uaMobile: 'no',
    });

    let authenticatedAccount = '';
    let authenticatedPassword = '';
    try {
      authenticatedAccount = await authenticateRedgitsWithBrowser(candidateAccounts, cookieJar);
      if (authenticatedAccount) {
        authenticatedPassword = candidateAccounts.find((account) => account.username === authenticatedAccount)?.password || '';
        console.log(`[RedGITS Sync] Browser login succeeded for account "${authenticatedAccount}".`);
      }
    } catch (browserErr) {
      console.warn(
        '[RedGITS Sync] Browser login unavailable; falling back to HTTP login:',
        browserErr instanceof Error ? browserErr.message : browserErr
      );
    }

    for (const acct of candidateAccounts) {
      if (authenticatedAccount) break;
      cookieJar.delete('ci_session');
      cookieJar.delete('PHPSESSID');
      cookieJar.delete('admin_remember');
      try {
        const loginPageRes = await fetch(`${REDGITS_ORIGIN}/admin/login`, {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            Cookie: getCookieHeader(),
          },
        });
        saveCookies(loginPageRes);
        const loginPageHtml = await loginPageRes.text().catch(() => '');

        // Extract dynamic honeypot fields (fake_user_*, fake_pass_*) added by RedGITS v17.13 login form
        const formParams: Record<string, string> = {};
        const fakeInputRegex = /<input[^>]+name=["'](fake_(?:user|pass)_[a-zA-Z0-9_]+)["']/gi;
        let fakeMatch: RegExpExecArray | null;
        while ((fakeMatch = fakeInputRegex.exec(loginPageHtml)) !== null) {
          if (fakeMatch[1]) {
            formParams[fakeMatch[1]] = '';
          }
        }
        formParams.username = acct.username;
        formParams.password = acct.password;
        formParams.code = acct.username.toLowerCase() === 'admin' ? deviceCode : '';
        formParams.client_info = clientInfoPayload;

        const loginRes = await fetch(`${REDGITS_ORIGIN}/admin/login/check_login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            Cookie: getCookieHeader(),
            'User-Agent': USER_AGENT,
            Referer: `${REDGITS_ORIGIN}/admin/login`,
            Origin: REDGITS_ORIGIN,
          },
          body: new URLSearchParams(formParams).toString(),
          redirect: 'manual',
        });
        saveCookies(loginRes);

        const loginLocation = loginRes.headers.get('location') || '';
        const isLoginRedirectToLogin = loginLocation.includes('/admin/login');
        if (!isLoginRedirectToLogin && (cookieJar.has('ci_session') || cookieJar.has('PHPSESSID') || (loginRes.status >= 300 && loginRes.status < 400))) {
          authenticatedAccount = acct.username;
          authenticatedPassword = acct.password;
          break;
        }
        console.warn(
          `[RedGITS Sync] Login rejected for RedGITS account "${acct.username}" (status=${loginRes.status}, location="${loginLocation}") — trying next account.`
        );
      } catch (loginErr: any) {
        console.warn(`[RedGITS Sync] Login request failed for "${acct.username}":`, loginErr?.message || loginErr);
      }
    }

    const redgitsUsername = authenticatedAccount || primaryUsername;
    const redgitsPassword = authenticatedPassword || primaryPassword;

    if (!authenticatedAccount) {
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

    // Helper to fetch Guest Report (/admin/reports/guest_member) with LAST CALL & COME FROM
    const fetchGuestReportMap = async (fromDate: string, toDate: string) => {
      const map = new Map<
        string,
        {
          code: string;
          memberName: string;
          salesMan: string;
          comeFrom: string;
          source: string;
          date: string;
          lastCall: { text: string; date: string; author: string; raw: string } | null;
        }
      >();
      try {
        const r = await fetch(
          `${REDGITS_ORIGIN}/admin/reports/guest_member?salesID=&from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&trainer=&comefrom=&source=`,
          {
            headers: {
              Cookie: getCookieHeader(),
              'User-Agent': USER_AGENT,
              Referer: `${REDGITS_ORIGIN}/admin/reports/guestmembers`,
            },
          }
        );
        saveCookies(r);
        if (!r.ok) return map;
        const html = await r.text();
        const tableStart = html.indexOf('id="table1"');
        const tbodyStart = html.indexOf('<tbody>', tableStart);
        const tbodyEnd = html.indexOf('</tbody>', tbodyStart);
        const tbodyHtml = tableStart > -1 && tbodyStart > -1 && tbodyEnd > -1 ? html.slice(tbodyStart, tbodyEnd) : '';
        if (!tbodyHtml) return map;

        const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let trMatch: RegExpExecArray | null;
        while ((trMatch = trRegex.exec(tbodyHtml)) !== null) {
          const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          const cells: string[] = [];
          let tdMatch: RegExpExecArray | null;
          while ((tdMatch = tdRegex.exec(trMatch[1] || '')) !== null) {
            cells.push(tdMatch[1] || '');
          }
          if (cells.length >= 7) {
            const code = stripHtmlAndExtractId(cells[0]).replace(/\[ID:\d+\]/g, '').trim();
            const memberName = stripHtmlAndExtractId(cells[1]).replace(/\[ID:\d+\]/g, '').trim();
            const salesMan = cleanSalesRepName(stripHtmlAndExtractId(cells[2]));
            const comeFrom = stripHtmlAndExtractId(cells[3]);
            const source = stripHtmlAndExtractId(cells[4]);
            const date = stripHtmlAndExtractId(cells[5]);
            const withNewlines = String(cells[6] || '')
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<\/p>/gi, '\n')
              .replace(/<[^>]+>/g, '');
            const lines = withNewlines
              .replace(/&nbsp;/gi, ' ')
              .replace(/&amp;/gi, '&')
              .replace(/&quot;/gi, '"')
              .replace(/&#039;/gi, "'")
              .split('\n')
              .map((l) => l.replace(/\s+/g, ' ').trim())
              .filter(Boolean);
            let lastCall: { text: string; date: string; author: string; raw: string } | null = null;
            if (lines.length > 0) {
              let dateStr = '';
              let authorStr = '';
              const noteLines: string[] = [];
              for (const line of lines) {
                if (/^\d{4}-\d{2}-\d{2}(\s+\d{2}:\d{2}(:\d{2})?)?$/.test(line)) {
                  dateStr = line;
                } else if (dateStr && !authorStr) {
                  authorStr = line;
                } else {
                  noteLines.push(line);
                }
              }
              const text = noteLines.join(' — ').trim();
              if (text || dateStr || authorStr) {
                lastCall = {
                  text: text || 'Call logged',
                  date: dateStr || '',
                  author: authorStr || '',
                  raw: lines.join(' / '),
                };
              }
            }
            if (code) {
              map.set(code, { code, memberName, salesMan, comeFrom, source, date, lastCall });
            }
          }
        }
      } catch (e) {
        console.warn('[RedGITS Sync] Warning fetching guest_member report:', e);
      }
      return map;
    };

    // 3. Fetch datasets in controlled waves so CodeIgniter / PHPSESSID file locks never drop or collide
    const pkgCatalogRows = await fetchHtmlTable('/admin/packages/show');
    const activeRows = await fetchDataTableJson('active', 50000);
    // RedGITS (CodeIgniter) locks + rotates `ci_session` per request, so concurrent requests on the
    // same cookie jar can race on rotation and get bounced to /admin/login. Fetch strictly sequentially.
    const pkgListRows = await fetchHtmlTable('/admin/packagelist');
    const natRows = await fetchHtmlTable('/admin/reports/nationalMembers');
    const guestRows = await fetchDataTableJson('guest', 450);
    const invRows = await fetchDataTableJson('viewinvitation', 400);
    const staffRows = await fetchHtmlTable('/admin/staff/show');
    const guestReportFromDate = mode === 'full' ? '2025-01-01' : new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
    const guestReportByRedgitsId = await fetchGuestReportMap(guestReportFromDate, '2026-12-31');
    const expiredRows = mode === 'full' ? await fetchDataTableJson('expiredmember', 10000) : [];

    // Fetch live Check-ins from /admin/check/getactivitesday (last 10 days in fast mode, last 45 days in full mode)
    const checkInDaysBack = mode === 'full' ? 45 : 10;
    const checkInFromDate = new Date(Date.now() - checkInDaysBack * 86400000).toISOString().slice(0, 10);
    const checkInToDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const liveCheckInRecords: Array<{
      redgitsId: string;
      clientDocId: string;
      memberName: string;
      cardMemberId: string;
      dateStr: string;
      dayName: string;
      checkInTime: string;
      checkOutTime: string;
      checkedInIso: string;
      packagePrimary: string;
      packageCategory: string;
      packageName: string;
      locker: string;
      noteCheckIn: string;
      createdBy: string;
      notes: string;
    }> = [];

    try {
      const actUrl = `${REDGITS_ORIGIN}/admin/check/getactivitesday?fromdate=${encodeURIComponent(
        `${checkInFromDate} 00:00:00`
      )}&todate=${encodeURIComponent(`${checkInToDate} 23:59:59`)}&gender=&all=&note=`;
      const actRes = await fetch(actUrl, {
        headers: {
          Cookie: getCookieHeader(),
          'User-Agent': USER_AGENT,
          Referer: `${REDGITS_ORIGIN}/admin/check/memberactivities`,
        },
      });
      saveCookies(actRes);
      if (actRes.ok) {
        const actHtml = await actRes.text();
        const tblStart = actHtml.indexOf('sample16c');
        const tbStart = tblStart > -1 ? actHtml.indexOf('<tbody>', tblStart) : -1;
        const tbEnd = tbStart > -1 ? actHtml.indexOf('</tbody>', tbStart) : -1;
        const tbHtml = tbStart > -1 && tbEnd > -1 ? actHtml.slice(tbStart, tbEnd) : '';
        if (tbHtml) {
          const cleanActCell = (h: string) =>
            String(h || '')
              .replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<br\s*\/?>/gi, ' ')
              .replace(/<[^>]+>/g, ' ')
              .replace(/&nbsp;/gi, ' ')
              .replace(/&amp;/gi, '&')
              .replace(/&#039;/gi, "'")
              .replace(/&quot;/gi, '"')
              .replace(/\s+/g, ' ')
              .trim();
          const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
          let trM: RegExpExecArray | null;
          while ((trM = trRe.exec(tbHtml)) !== null) {
            const tds: string[] = [];
            const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
            let tdM: RegExpExecArray | null;
            while ((tdM = tdRe.exec(trM[1] || '')) !== null) {
              tds.push(tdM[1] || '');
            }
            if (tds.length < 13) continue;
            const idM = `${tds[0]} ${tds[1]} ${tds[2]}`.match(/\/admin\/members\/view\/(\d+)/i);
            const rId = idM?.[1]?.trim() || '';
            const dayAndDate = cleanActCell(tds[3] || '');
            const dateM = dayAndDate.match(/(\d{4}-\d{2}-\d{2})/);
            const dStr = dateM?.[1] || '';
            if (!rId || !dStr) continue;
            const tRaw = cleanActCell(tds[4] || '');
            const validT = /^\d{2}:\d{2}(:\d{2})?$/.test(tRaw) ? (tRaw.length === 5 ? `${tRaw}:00` : tRaw) : '12:00:00';
            liveCheckInRecords.push({
              redgitsId: rId,
              clientDocId: `redgits-${rId}`,
              memberName: cleanActCell(tds[1] || ''),
              cardMemberId: cleanActCell(tds[2] || ''),
              dateStr: dStr,
              dayName: dayAndDate.replace(/\d{4}-\d{2}-\d{2}/, '').trim(),
              checkInTime: validT,
              checkOutTime: cleanActCell(tds[5] || ''),
              checkedInIso: `${dStr}T${validT}`,
              packagePrimary: cleanActCell(tds[6] || '') || 'Primary Package',
              packageCategory: cleanActCell(tds[7] || '') || 'Membership',
              packageName: cleanActCell(tds[8] || '') || 'Basic Membership',
              locker: cleanActCell(tds[10] || ''),
              noteCheckIn: cleanActCell(tds[11] || ''),
              createdBy: cleanActCell(tds[12] || '') || 'Front Desk',
              notes: cleanActCell(tds[14] || ''),
            });
          }
        }
      }
    } catch (e) {
      console.warn('[RedGITS Sync] Warning fetching getactivitesday check-ins:', e);
    }

    if (activeRows.length === 0 && pkgCatalogRows.length === 0) {
      res.status(502).json({
        error:
          'RedGITS returned 0 records during live scrape (session may have been challenged by BlockIntel or credentials expired). Existing database records were preserved untouched.',
      });
      return;
    }

    // 4. Persist updated credentials only if explicitly supplied AND those exact credentials authenticated
    const nowIso = new Date().toISOString();
    if (req.body?.username && req.body?.password && authenticatedAccount === String(req.body.username).trim()) {
      try {
        await inzanDb.collection('settings').doc('redgits_credentials').set({
          username: redgitsUsername,
          password: redgitsPassword,
          updatedAt: nowIso,
          updatedBy: caller.email,
        }, { merge: true });
      } catch (credErr: any) {
        console.error('[RedGITS Sync] Failed to persist RedGITS credentials:', credErr?.message || credErr);
      }
    }

    // Load existing users and existing redgits client phones/packages so we don't overwrite or re-fetch unnecessarily
    const [existingUsersSnap, existingClientsSnap] = await Promise.all([
      inzanDb.collection('users').get(),
      inzanDb
        .collection('clients')
        .select('phone', 'redgitsId', 'memberId', 'status', 'packages', 'invitationsUsed', 'freezeDaysUsed', 'freePtSessionsUsed', 'lastCall', 'lastComment', 'lastCallText', 'lastCallDate', 'lastCallBy', 'comeFromType', 'createdAt', 'lastContactDate', 'redgitsMobileChecked')
        .get(),
    ]);

    const existingPhoneByDocId = new Map<string, string>();
    const existingClientDataByDocId = new Map<string, Record<string, any>>();
    for (const cDoc of existingClientsSnap.docs) {
      const d = cDoc.data();
      existingClientDataByDocId.set(cDoc.id, d || {});
      const cleanExistingPhone = normalizePhone(d?.phone);
      if (cleanExistingPhone) {
        existingPhoneByDocId.set(cDoc.id, cleanExistingPhone);
      }
    }

    const repUserIdByName = new Map<string, string>();
    const repDisplayNameById = new Map<string, string>();
    const existingUsersById = new Map<string, Record<string, any>>();

    for (const docSnap of existingUsersSnap.docs) {
      const u = docSnap.data();
      existingUsersById.set(docSnap.id, u || {});
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

    const NON_SALES_USER_PLACEHOLDERS = new Set([
      'admin',
      'black-list',
      'blacklist',
      'inzan athletics',
      'inzan',
      'transfer',
      'trasnfer',
      'beezo',
      'dr.nagham',
      'dr nagham',
      'none',
      'null',
      'system',
    ]);

    function ensureSalesRepUser(rawName?: string): { id: string; name: string } | null {
      const clean = cleanSalesRepName(rawName);
      if (!clean) return null;
      const lower = clean.toLowerCase();
      if (NON_SALES_USER_PLACEHOLDERS.has(lower)) return null;
      const existingId = repUserIdByName.get(lower);
      if (existingId) {
        const canonicalName = repDisplayNameById.get(existingId) || clean;
        return { id: existingId, name: canonicalName };
      }

      const slug = slugifyName(clean);
      if (!slug) return null;
      const newId = `redgits-rep-${slug}`;
      repUserIdByName.set(lower, newId);
      repDisplayNameById.set(newId, clean);
      const existingUserDoc = existingUsersById.get(newId);
      if (existingUserDoc) {
        return { id: newId, name: String(existingUserDoc.name || clean) };
      }
      userDocsMap.set(newId, {
        id: newId,
        data: {
          id: newId,
          name: clean,
          email: `${slug}@inzanathletics.com`,
          role: 'rep',
          department: 'Sales',
          status: 'working',
          branch: 'Garden 8',
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
      const isPtPackage = /pt|private|trainer/i.test(`${pkgCategory || ''} ${sessionName}`);
      const resolvedCategory = pkgCategory?.trim() || (isPtPackage ? 'Personal Training' : 'Membership');
      const resolvedCatLower = resolvedCategory.toLowerCase();
      const isSecondary =
        /^(yes|secondary|1|true)$/i.test(String(mustHavePrimaryRaw || '').trim()) ||
        (resolvedCatLower !== 'membership' && resolvedCatLower !== 'gym memberships' && resolvedCatLower !== 'memberships');
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
        category: resolvedCategory,
        hierarchy: isSecondary ? 'Secondary' : 'Primary',
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
    const nutritionProfileDocs: Array<{ id: string; data: Record<string, any> }> = [];
    const defaultNutritionSchedule = {
      Sunday: { enabled: true, startTime: '10:00', endTime: '20:00', appointmentDuration: 45 },
      Monday: { enabled: true, startTime: '10:00', endTime: '20:00', appointmentDuration: 45 },
      Tuesday: { enabled: true, startTime: '10:00', endTime: '20:00', appointmentDuration: 45 },
      Wednesday: { enabled: true, startTime: '10:00', endTime: '20:00', appointmentDuration: 45 },
      Thursday: { enabled: true, startTime: '10:00', endTime: '20:00', appointmentDuration: 45 },
      Friday: { enabled: false, startTime: '12:00', endTime: '18:00', appointmentDuration: 45 },
      Saturday: { enabled: true, startTime: '10:00', endTime: '20:00', appointmentDuration: 45 },
    };
    for (const sRow of staffRows) {
      if (!Array.isArray(sRow) || sRow.length < 7) continue;
      const [sCode, sName, sMobile, , , sDept, sPos, , sSalary, , , , , , sStatus, , sNatId, sStart, , sUsername] =
        sRow;
      if (!sName || !sName.trim()) continue;
      const cleanStaffName = sName.trim();
      const dept = (sDept || 'Fitness').trim();
      const pos = (sPos || sDept || 'Trainer').trim();
      if (/sales/i.test(`${dept} ${pos}`) && !/experience|finance|fitness|nutrition|kitchen/i.test(dept)) {
        ensureSalesRepUser(cleanStaffName);
      }
      const cId = `redgits-staff-${sCode || slugifyName(cleanStaffName)}`;
      const isActiveStaff = sStatus !== 'Suspend';
      coachDocs.push({
        id: cId,
        data: {
          id: cId,
          coachId: `STAFF-${String(sCode || '000').padStart(3, '0')}`,
          name: cleanStaffName,
          phone: normalizePhone(sMobile),
          specialty: pos,
          department: dept,
          status: isActiveStaff ? 'Active' : 'Inactive',
          salary: parseFloat(String(sSalary || '0').replace(/[^\d.]/g, '')) || 0,
          nationalId: sNatId || '',
          hireDate: sStart || nowIso.slice(0, 10),
          username: sUsername || '',
          branch: 'Inzan Athletics',
          sourceSystem: 'RedGITS_v17.12',
          updatedAt: nowIso,
        },
      });
      if (/nutrition/i.test(`${dept} ${pos}`)) {
        nutritionProfileDocs.push({
          id: cId,
          data: {
            id: cId,
            userId: cId,
            name: cleanStaffName,
            phone: normalizePhone(sMobile),
            specialty: pos || 'Clinical & Sports Nutrition',
            bio: `${pos || 'Nutrition Specialist'} at Inzan Athletics (Garden 8)`,
            active: isActiveStaff,
            schedule: defaultNutritionSchedule,
            updatedAt: nowIso,
          },
        });
      }
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

    // Fetch unmasked mobile numbers via /admin/member_data/get_mobile/{id} for any member or lead missing a phone
    // Prioritize Active members first, then Leads, then Expired members
    const idsNeedingMobile: string[] = [];
    const checkedMobileIds = new Set<string>();
    const maxMobileLookups = mode === 'full' ? 2500 : 1200;
    const priorityOrder: Array<'active' | 'lead' | 'expired'> = ['active', 'lead', 'expired'];

    for (const targetType of priorityOrder) {
      for (const [rId, entry] of listByRedgitsId.entries()) {
        if (entry.rowType !== targetType) continue;
        if (idsNeedingMobile.length >= maxMobileLookups) break;
        const docId = `redgits-${rId}`;
        const existingC = existingClientDataByDocId.get(docId);
        const natEntry = natByRedgitsId.get(rId);
        const rawRowCardId =
          entry.rowType === 'active'
            ? entry.row[2]
            : entry.rowType === 'expired'
            ? entry.row[1]
            : '';
        const realCardId = cleanMemberId(rawRowCardId || natEntry?.memberId, rId);
        const knownPhone =
          existingPhoneByDocId.get(docId) ||
          phoneByRedgitsId.get(rId) ||
          (realCardId ? phoneByCardId.get(realCardId) : undefined);
        if (!knownPhone && !existingC?.redgitsMobileChecked) {
          idsNeedingMobile.push(rId);
        }
      }
    }

    let unmaskedPhonesFetched = 0;
    let mobileLookupsSkipped = 0;
    if (idsNeedingMobile.length > 0) {
      // RedGITS serializes requests per ci_session, so extra concurrency only adds cookie-rotation races.
      // A wall-clock budget keeps the HTTP request well under Cloud Run / proxy timeouts; any IDs not
      // reached stay un-flagged (redgitsMobileChecked unset) and are picked up by the next sync.
      const MOBILE_CONCURRENCY = 2;
      const mobileDeadlineMs = Date.now() + (mode === 'full' ? 75_000 : 30_000);
      let mIdx = 0;
      let sessionLost = false;
      const fetchMobileWorker = async () => {
        while (mIdx < idsNeedingMobile.length && !sessionLost && Date.now() < mobileDeadlineMs) {
          const targetId = idsNeedingMobile[mIdx++];
          if (!targetId) continue;
          try {
            const r = await fetch(`${REDGITS_ORIGIN}/admin/member_data/get_mobile/${targetId}`, {
              headers: {
                Cookie: getCookieHeader(),
                'User-Agent': USER_AGENT,
                'X-Requested-With': 'XMLHttpRequest',
              },
              redirect: 'manual',
            });
            saveCookies(r);
            if (r.status >= 300 && r.status < 400) {
              sessionLost = true;
              console.warn('[RedGITS Sync] get_mobile redirected (session expired) — stopping phone lookups for this run.');
              break;
            }
            if (r.ok) {
              const j: any = await r.json();
              checkedMobileIds.add(targetId);
              const clean = normalizePhone(j?.mobile);
              if (clean) {
                phoneByRedgitsId.set(targetId, clean);
                unmaskedPhonesFetched++;
              }
            }
          } catch (mobileErr: any) {
            console.warn(`[RedGITS Sync] get_mobile/${targetId} failed:`, mobileErr?.message || mobileErr);
          }
        }
      };
      await Promise.all(Array.from({ length: MOBILE_CONCURRENCY }, () => fetchMobileWorker()));
      mobileLookupsSkipped = Math.max(0, idsNeedingMobile.length - checkedMobileIds.size);
      if (mobileLookupsSkipped > 0) {
        console.log(`[RedGITS Sync] ${mobileLookupsSkipped} phone lookups deferred to the next sync (time budget).`);
      }
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

      // Strictly look up subscriptions by RedGITS internal ID rId (never by sequential cardMemberId)
      const memberSubs = subscriptionsByRedgitsId.get(rId) || [];
      realCardMemberId = cleanMemberId(realCardMemberId || memberSubs[0]?.memberId || natEntry?.memberId, rId);
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

      // Determine true Primary Membership vs Secondary Package from mergedPackages (sorted by latest endDate DESC)
      const sortedPackagesDesc = [...mergedPackages].sort((a, b) =>
        String(b.endDate || '0000-00-00').localeCompare(String(a.endDate || '0000-00-00'))
      );
      const primaryRecord =
        sortedPackagesDesc.find((p) => p.hierarchyType === 'Primary' && p.status !== 'Expired') ||
        sortedPackagesDesc.find((p) => p.status !== 'Expired') ||
        sortedPackagesDesc.find((p) => p.hierarchyType === 'Primary') ||
        sortedPackagesDesc[0];
      const secondaryRecord = sortedPackagesDesc.find(
        (p) => p.hierarchyType === 'Secondary' && p.status !== 'Expired'
      );

      // If any package in mergedPackages is currently Active/Frozen, never leave member global status as Expired
      const todayStr = nowIso.slice(0, 10);
      if (status === 'Expired' && primaryRecord && primaryRecord.status !== 'Expired' && (!primaryRecord.endDate || primaryRecord.endDate >= todayStr)) {
        status = primaryRecord.status === 'Frozen' ? 'Hold' : 'Active';
      }

      const resolvedPrimaryPkgName =
        primaryRecord?.packageName || existingClient.primaryPackageName || packageName || (status === 'Lead' ? 'Prospect' : 'Membership');
      const resolvedPrimaryExpiry =
        primaryRecord?.endDate || existingClient.membershipExpiry || endDate || null;
      const resolvedPrimaryStart =
        primaryRecord?.startDate || existingClient.startDate || startDate || nowIso.slice(0, 10);
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
      const existingMemberIdStr = cleanMemberId(existingClient.memberId, rId);
      const resolvedMemberId =
        status === 'Lead'
          ? ''
          : realCardMemberId
          ? realCardMemberId
          : existingMemberIdStr
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

      const guestReportEntry = guestReportByRedgitsId.get(rId);
      const resolvedLastCall = guestReportEntry?.lastCall || existingClient.lastCall || undefined;
      const resolvedComeFrom = guestReportEntry?.comeFrom || existingClient.comeFromType || undefined;
      const resolvedCreatedAt = guestReportEntry?.date || existingClient.createdAt || resolvedPrimaryStart || nowIso;
      const resolvedLastContactDate =
        resolvedLastCall?.date || existingClient.lastContactDate || guestReportEntry?.date || undefined;

      const existingPhotoUrl = String(existingClient.photoURL || existingClient.photoUrl || '').trim();
      const resolvedPhotoUrl =
        existingPhotoUrl && !/\/uploads\/?$/i.test(existingPhotoUrl)
          ? existingPhotoUrl
          : status !== 'Lead' && /^\d+$/.test(rId)
          ? `${REDGITS_ORIGIN}/uploads/members/${rId}-cam.jpg`
          : undefined;

      const codeGroupMeta = getMemberCodeGroupMeta(resolvedMemberId);
      const existingSecBarcodes = Array.isArray(existingClient.secondaryBarcodes)
        ? existingClient.secondaryBarcodes.map((b: any) => String(b).trim()).filter(Boolean)
        : [];
      const mergedSecondaryBarcodes = Array.from(
        new Set(
          [
            ...existingSecBarcodes,
            resolvedMemberId,
            resolvedMemberId ? resolvedMemberId.toUpperCase() : '',
            resolvedMemberId ? resolvedMemberId.toLowerCase() : '',
            resolvedLeadId,
          ].filter(Boolean)
        )
      );

      const clientData: Record<string, any> = {
        id: clientDocId,
        redgitsId: rId,
        legacyMemberId: rId,
        leadId: resolvedLeadId,
        memberId: resolvedMemberId ? resolvedMemberId : FieldValue.delete(),
        memberCodePrefix: codeGroupMeta?.prefix || existingClient.memberCodePrefix || undefined,
        memberCodeGroup: codeGroupMeta?.group || existingClient.memberCodeGroup || undefined,
        secondaryBarcodes: mergedSecondaryBarcodes.length > 0 ? mergedSecondaryBarcodes : undefined,
        name,
        phone,
        redgitsMobileChecked: Boolean(phone || existingClient.redgitsMobileChecked || checkedMobileIds.has(rId)) || undefined,
        photoURL: resolvedPhotoUrl,
        nationalId: nationalId || existingClient.nationalId || undefined,
        dateOfBirth: dateOfBirth || existingClient.dateOfBirth || undefined,
        gender: /fem|انث|أنث/i.test(genderRaw) ? 'Female' : 'Male',
        memberCategory: inferMemberCategory(resolvedPrimaryPkgName, name),
        status,
        stage: status === 'Lead' ? (existingClient.stage || 'New') : undefined,
        paid: status === 'Lead' ? false : existingClient.paid,
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
        advertisingSource: guestReportEntry?.source || advSource,
        source: advSource,
        comeFromType: resolvedComeFrom,
        createdAt: resolvedCreatedAt,
        lastContactDate: resolvedLastContactDate,
        lastCall: resolvedLastCall,
        lastCallText: resolvedLastCall?.text || existingClient.lastCallText || undefined,
        lastCallDate: resolvedLastCall?.date || existingClient.lastCallDate || undefined,
        lastCallBy: resolvedLastCall?.author || existingClient.lastCallBy || undefined,
        lastComment: existingClient.lastComment || undefined,
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

    // Build top-level `attendance` docs and `clients/{id}/attendance_history` writes from liveCheckInRecords
    const attendanceDocsMap = new Map<string, { id: string; data: Record<string, any> }>();
    const subColAttWrites: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];
    for (const cRec of liveCheckInRecords) {
      const timeClean = cRec.checkInTime.replace(/:/g, '');
      const attDocId = `redgits-checkin-${cRec.redgitsId}-${cRec.dateStr}_${timeClean}`;
      const combinedNotes = [
        cRec.locker ? `Locker: ${cRec.locker}` : '',
        cRec.checkOutTime ? `Out: ${cRec.checkOutTime}` : '',
        cRec.noteCheckIn ? `Check-in Note: ${cRec.noteCheckIn}` : '',
        cRec.notes || '',
      ]
        .filter(Boolean)
        .join(' · ');

      attendanceDocsMap.set(attDocId, {
        id: attDocId,
        data: {
          id: attDocId,
          clientId: cRec.clientDocId,
          memberId: cRec.cardMemberId || cRec.redgitsId,
          redgitsId: cRec.redgitsId,
          memberName: cRec.memberName || 'Member',
          branch: 'Garden 8',
          date: cRec.checkedInIso,
          sessionDate: cRec.dateStr,
          checkInTime: cRec.checkInTime,
          checkOutTime: cRec.checkOutTime || undefined,
          packageName: cRec.packageName,
          packageCategory: cRec.packageCategory,
          packagePrimary: cRec.packagePrimary,
          locker: cRec.locker || undefined,
          recordedBy: cRec.createdBy,
          recordedByName: cRec.createdBy,
          notes: combinedNotes || undefined,
          status: 'ATTENDED',
          sourceSystem: 'RedGITS_v17.12',
          updatedAt: nowIso,
        },
      });

      subColAttWrites.push({
        ref: inzanDb.collection('clients').doc(cRec.clientDocId).collection('attendance_history').doc(attDocId),
        data: {
          id: attDocId,
          memberId: cRec.clientDocId,
          cardMemberId: cRec.cardMemberId || undefined,
          memberName: cRec.memberName || undefined,
          sessionTitle: cRec.packageName,
          packageCategory: cRec.packageCategory,
          packagePrimary: cRec.packagePrimary,
          branchName: 'Garden 8',
          sessionDate: cRec.dateStr,
          dayName: cRec.dayName || undefined,
          checkInTime: cRec.checkInTime,
          checkOutTime: cRec.checkOutTime || undefined,
          locker: cRec.locker || undefined,
          checkedInAt: cRec.checkedInIso,
          checkedInBy: cRec.createdBy,
          status: 'ATTENDED',
          notes: combinedNotes || undefined,
          remainingCreditsAfter: 30,
          sourceSystem: 'RedGITS_v17.12',
        },
      });
    }
    const attendanceDocs = Array.from(attendanceDocsMap.values());

    // 11. Commit all batches to `db-inzanathletics`
    await commitDocsInBatches(inzanDb, 'users', userDocs);
    await commitDocsInBatches(inzanDb, 'packages', packageDocs);
    await commitDocsInBatches(inzanDb, 'coaches', coachDocs);
    if (nutritionProfileDocs.length > 0) {
      await commitDocsInBatches(inzanDb, 'nutritionistProfiles', nutritionProfileDocs);
    }
    await commitDocsInBatches(inzanDb, 'clients', clientDocs);
    await commitDocsInBatches(inzanDb, 'payments', paymentDocs);
    await commitDocsInBatches(inzanDb, 'guestInvites', inviteDocs);
    await commitDocsInBatches(inzanDb, 'attendance', attendanceDocs);

    if (subColAttWrites.length > 0) {
      const SUB_BATCH = 450;
      for (let i = 0; i < subColAttWrites.length; i += SUB_BATCH) {
        const chunk = subColAttWrites.slice(i, i + SUB_BATCH);
        const b = inzanDb.batch();
        for (const item of chunk) {
          b.set(item.ref, stripUndefinedDeep(item.data), { merge: true });
        }
        await b.commit();
      }
    }

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
      lastSyncAt: completedAt,
      syncedAt: completedAt,
      durationMs,
      syncedBy: caller.name || caller.email,
      lastSyncBy: caller.name || caller.email,
      status: 'completed',
      mobileLookupsDeferred: mobileLookupsSkipped,
      redgitsAccountUsed: authenticatedAccount || redgitsUsername,
      counts: {
        activeMembers: syncedActiveCount,
        expiredMembers: syncedExpiredCount,
        leads: syncedLeadsCount,
        packages: packageDocs.length,
        payments: paymentDocs.length,
        staff: coachDocs.length,
        salesReps: userDocs.length,
        invitations: inviteDocs.length,
        checkIns: attendanceDocs.length,
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
