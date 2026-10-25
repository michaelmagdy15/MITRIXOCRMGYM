/**
 * Live RedGITS Phone Numbers & Member IDs Full Resync for Inzan Athletics (`db-inzanathletics`)
 *
 * - Authenticates with https://inzan.redgits.com using a 16-session parallel worker pool
 * - Fetches live Active Members, Expired Members, Leads, Package Subscriptions, National Members,
 *   and Package Members Report to recover all Member IDs (`memberId`) and unmasked phones
 * - Calls `/admin/member_data/get_mobile/{id}` for every Active, Hold, Expired, and Lead record
 *   missing a phone number
 * - Cleans invalid `Code (xxxxx)` memberId placeholders
 * - Commits updates in batches to `db-inzanathletics` and updates `settings/redgits_sync_status`
 */

const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'faa-test-guide-v2';
const DATABASE_ID = 'db-inzanathletics';
const REDGITS_ORIGIN = 'https://inzan.redgits.com';
const REDGITS_USER = process.env.REDGITS_USERNAME || 'trasnfer';
const REDGITS_PASS = process.env.REDGITS_PASSWORD || '12122020Aa$';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: PROJECT_ID });
}
const inzanDb = getFirestore(DATABASE_ID);

const CACHE_FILE = path.resolve(process.cwd(), 'docs/redgits_pages/redgits_phones_cache.json');

function normalizePhone(raw) {
  if (!raw) return '';
  const str = String(raw).trim();
  if (str.includes('*') || str === 'NOT ALLOWED') return '';
  const digits = str.replace(/[^\d]/g, '');
  if (!digits || digits.length < 8) return '';
  // Filter out RedGITS dummy placeholder numbers like +2010000000000 or 01000000000
  if (/^(20)?0?1[0125]0{8,}$/.test(digits) || /^0{8,}$/.test(digits)) return '';
  if (digits.startsWith('2001') && digits.length === 13) return digits.slice(2);
  if (digits.startsWith('201') && (digits.length === 12 || digits.length === 11)) return '0' + digits.slice(2);
  if (digits.startsWith('1') && digits.length === 10) return '0' + digits;
  return digits;
}

function cleanMemberId(raw, rId) {
  if (!raw) return '';
  const s = String(raw)
    .replace(/\[ID:\d+\]/g, '')
    .trim();
  if (!s || s === '0' || s === '-' || s.toLowerCase() === 'null' || s.toLowerCase() === 'none') return '';
  if (/^code\s*\(/i.test(s)) return '';
  // If existing memberId was erroneously set to a 5-digit RedGITS internal ID, ignore it
  if (rId && s === String(rId).trim() && Number(rId) >= 10000) return '';
  return s;
}

function stripHtmlAndExtractId(cellHtml) {
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

function parseHtmlTableRows(html) {
  const cleanHtml = html.replace(/<table[^>]*id=["']searchall["'][\s\S]*?<\/table>/gi, '');
  const tbodyMatch = cleanHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const target = tbodyMatch && tbodyMatch[1] ? tbodyMatch[1] : cleanHtml;
  const rows = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(target)) !== null) {
    const trInner = trMatch[1] || '';
    const cells = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trInner)) !== null) {
      cells.push(stripHtmlAndExtractId(tdMatch[1]));
    }
    if (cells.length >= 4 && !cells[0]?.includes('No data available')) {
      rows.push(cells);
    }
  }
  return rows;
}

async function createRedgitsSession(idx) {
  const cookieJar = new Map();
  const s = String(idx).padStart(2, '0');
  const deviceId = `fd182a91-4d82-4e11-9a15-8b3d7a109c${s}`;
  const installId = `7c991b22-1c30-4f88-a241-99e1c4102b${s}`;
  const clientFp = `e8b1204f9a3d11c8402e7a19c5d3b2${s}`;
  const deviceCode = `DEV-INZAN-SYNC-${s}`;
  cookieJar.set('device_id', deviceId);
  cookieJar.set('ua_install_id', installId);
  cookieJar.set('ua_client_fp', clientFp);
  cookieJar.set('ua_device_code', deviceCode);

  const saveCookies = (response) => {
    let setCookies = [];
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

  const r0 = await fetch(`${REDGITS_ORIGIN}/admin/login`, {
    headers: { 'User-Agent': USER_AGENT, Cookie: getCookieHeader() },
  });
  saveCookies(r0);

  const r1 = await fetch(`${REDGITS_ORIGIN}/admin/login/check_login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: getCookieHeader(),
      'User-Agent': USER_AGENT,
      Referer: `${REDGITS_ORIGIN}/admin/login`,
      Origin: REDGITS_ORIGIN,
    },
    body: new URLSearchParams({
      username: REDGITS_USER,
      password: REDGITS_PASS,
      code: deviceCode,
      client_info: JSON.stringify({
        device_id: deviceId,
        install_id: installId,
        fingerprint: clientFp,
        device_code: deviceCode,
        user_agent: USER_AGENT,
        platform: 'Win32',
        language: 'en-US',
        screen: '1920x1080',
        timezone: 'Africa/Cairo',
      }),
    }).toString(),
    redirect: 'manual',
  });
  saveCookies(r1);

  return { getCookieHeader, saveCookies };
}

async function commitUpdatesInBatches(updates) {
  if (updates.length === 0) return 0;
  const BATCH_SIZE = 450;
  const CONCURRENCY = 6;
  const chunks = [];
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    chunks.push(updates.slice(i, i + BATCH_SIZE));
  }
  for (let c = 0; c < chunks.length; c += CONCURRENCY) {
    const group = chunks.slice(c, c + CONCURRENCY);
    await Promise.all(
      group.map(async (chunk) => {
        const batch = inzanDb.batch();
        for (const item of chunk) {
          const ref = inzanDb.collection('clients').doc(item.id);
          batch.set(ref, item.data, { merge: true });
        }
        await batch.commit();
      })
    );
  }
  return updates.length;
}

async function main() {
  const startTime = Date.now();
  console.log('=== Starting Live RedGITS Phone Numbers & Member IDs Full Resync ===');

  let phoneCache = {};
  if (fs.existsSync(CACHE_FILE)) {
    try {
      phoneCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch {}
  }

  // 1. Create primary session + 16 worker sessions
  console.log('1. Authenticating 16 parallel sessions with https://inzan.redgits.com...');
  const sessions = await Promise.all(Array.from({ length: 16 }, (_, i) => createRedgitsSession(i + 1)));
  const primary = sessions[0];

  const fetchDataTableJson = async (sess, endpoint, maxRows) => {
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
        Cookie: sess.getCookieHeader(),
        'User-Agent': USER_AGENT,
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${REDGITS_ORIGIN}/admin/members`,
      },
      body: dtParams.toString(),
    });
    sess.saveCookies(r);
    if (!r.ok) return [];
    const json = await r.json();
    if (!Array.isArray(json?.data)) return [];
    return json.data.map((row) => (Array.isArray(row) ? row.map((cell) => stripHtmlAndExtractId(cell)) : []));
  };

  const fetchHtmlTable = async (sess, pathUrl) => {
    const r = await fetch(`${REDGITS_ORIGIN}${pathUrl}`, {
      headers: {
        Cookie: sess.getCookieHeader(),
        'User-Agent': USER_AGENT,
        Referer: `${REDGITS_ORIGIN}/admin`,
      },
    });
    sess.saveCookies(r);
    if (!r.ok) return [];
    const html = await r.text();
    return parseHtmlTableRows(html);
  };

  // 2. Fetch bulk tables across independent sessions in parallel
  console.log('2. Fetching Active, Expired, Guest, PackageList, NationalMembers & PackageMembers tables...');
  const [activeRows, expiredRows, guestRows, pkgListRows, natRows, pkgMemberReportHtml] = await Promise.all([
    fetchDataTableJson(sessions[0], 'active', 50000),
    fetchDataTableJson(sessions[1], 'expiredmember', 50000),
    fetchDataTableJson(sessions[2], 'guest', 50000),
    fetchHtmlTable(sessions[3], '/admin/packagelist'),
    fetchHtmlTable(sessions[4], '/admin/reports/nationalMembers'),
    (async () => {
      const r = await fetch(
        `${REDGITS_ORIGIN}/admin/reports/getpackagemembers?packageID[]=All&staff=&date_from=2020-01-01&date_to=2027-12-31`,
        {
          headers: {
            Cookie: sessions[5].getCookieHeader(),
            'User-Agent': USER_AGENT,
          },
        }
      );
      sessions[5].saveCookies(r);
      return r.ok ? await r.text() : '';
    })(),
  ]);

  console.log(
    `   Fetched: active=${activeRows.length}, expired=${expiredRows.length}, guest=${guestRows.length}, pkgList=${pkgListRows.length}, nat=${natRows.length}`
  );

  // 3. Build authoritative Member ID & Phone maps from RedGITS tables
  const memberIdByRedgitsId = new Map();
  const phoneByRedgitsId = new Map();
  const phoneByCardId = new Map();

  for (const [rId, cachedPhone] of Object.entries(phoneCache)) {
    const clean = normalizePhone(cachedPhone);
    if (clean) phoneByRedgitsId.set(String(rId), clean);
  }

  // From nationalMembers: [rCode, name, sysId, natId, bday, sMan, rNotes]
  for (const nRow of natRows) {
    if (!Array.isArray(nRow) || nRow.length < 3) continue;
    const rId = String(nRow[0] || '').replace(/\[ID:\d+\]/g, '').trim();
    const mId = cleanMemberId(nRow[2], rId);
    if (rId && mId) memberIdByRedgitsId.set(rId, mId);
  }

  // From getpackagemembers report
  if (pkgMemberReportHtml) {
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = trRe.exec(pkgMemberReportHtml)) !== null) {
      const tr = m[1];
      const idM = tr.match(/\/admin\/members\/view\/(\d+)/i);
      if (!idM) continue;
      const rId = idM[1];
      const tds = [];
      const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let tm;
      while ((tm = tdRe.exec(tr)) !== null) {
        tds.push(tm[1].replace(/<[^>]+>/g, '').trim());
      }
      if (tds.length >= 3) {
        const mId = cleanMemberId(tds[2], rId);
        if (rId && mId) memberIdByRedgitsId.set(rId, mId);
      }
    }
  }

  // From packagelist: [createdAt, rawMemberName, memberId, pkgName, subType, paymentAmt, sn, _, rawMobile, ...]
  for (const row of pkgListRows) {
    if (!Array.isArray(row) || row.length < 9) continue;
    const idTagMatch = String(row[1] || '').match(/\[ID:(\d+)\]/);
    const rId = idTagMatch?.[1] || '';
    const mId = cleanMemberId(row[2], rId);
    const cleanP = normalizePhone(row[8]);
    if (rId && mId) memberIdByRedgitsId.set(rId, mId);
    if (rId && cleanP) {
      phoneByRedgitsId.set(rId, cleanP);
      phoneCache[rId] = cleanP;
    }
    if (mId && cleanP) phoneByCardId.set(mId, cleanP);
  }

  // From expiredRows: [Member Name, Member ID, MobileBtn, ...]
  for (const row of expiredRows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const idMatch = row.join(' ').match(/\[ID:(\d+)\]/);
    const rId = idMatch?.[1] ? idMatch[1] : /^\d+$/.test(row[0] || '') ? String(row[0]) : '';
    if (!rId) continue;
    const mId = cleanMemberId(row[1], rId);
    if (mId) memberIdByRedgitsId.set(rId, mId);
  }

  // From activeRows: [Code, Member Name, Member ID, ...]
  for (const row of activeRows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const idMatch = row.join(' ').match(/\[ID:(\d+)\]/);
    const rId = idMatch?.[1] ? idMatch[1] : /^\d+$/.test(row[0] || '') ? String(row[0]) : '';
    if (!rId) continue;
    const mId = cleanMemberId(row[2], rId);
    if (mId) memberIdByRedgitsId.set(rId, mId);
  }

  console.log(`   Indexed ${memberIdByRedgitsId.size} clean Member IDs from RedGITS tables.`);

  // 4. Load all existing clients from Firestore `db-inzanathletics`
  console.log('3. Reading existing clients from Firestore db-inzanathletics...');
  const clientsSnap = await inzanDb
    .collection('clients')
    .select('name', 'phone', 'memberId', 'redgitsId', 'leadId', 'status', 'redgitsMobileChecked')
    .get();

  console.log(`   Loaded ${clientsSnap.size} client documents from db-inzanathletics.`);

  // Separate IDs needing get_mobile into priority tiers: Active/Hold -> Expired -> Lead
  const tierActive = [];
  const tierExpired = [];
  const tierLead = [];
  const clientByDocId = new Map();

  for (const doc of clientsSnap.docs) {
    const d = doc.data();
    const rId = String(d.redgitsId || doc.id.replace(/^redgits-/, '')).trim();
    clientByDocId.set(doc.id, { id: doc.id, rId, ...d });

    if (!/^\d+$/.test(rId)) continue;

    const existingCleanPhone = normalizePhone(d.phone);
    const knownPhone =
      existingCleanPhone ||
      phoneByRedgitsId.get(rId) ||
      (d.memberId ? phoneByCardId.get(String(d.memberId).trim()) : '');

    if (!knownPhone && !(rId in phoneCache)) {
      if (d.status === 'Active' || d.status === 'Hold') {
        tierActive.push(rId);
      } else if (d.status === 'Expired') {
        tierExpired.push(rId);
      } else {
        tierLead.push(rId);
      }
    }
  }

  console.log(
    `4. Unmasked phones needed from /admin/member_data/get_mobile/{id}: Active=${tierActive.length}, Expired=${tierExpired.length}, Lead=${tierLead.length}`
  );

  // Helper to fetch mobile numbers in parallel across all 16 sessions
  async function fetchMobilesForTier(tierName, ids) {
    if (ids.length === 0) return 0;
    const t0 = Date.now();
    let cursor = 0;
    let fetchedReal = 0;
    let completed = 0;

    await Promise.all(
      sessions.map(async (sess) => {
        while (cursor < ids.length) {
          const targetId = ids[cursor++];
          if (!targetId) continue;
          try {
            const r = await fetch(`${REDGITS_ORIGIN}/admin/member_data/get_mobile/${targetId}`, {
              headers: {
                Cookie: sess.getCookieHeader(),
                'User-Agent': USER_AGENT,
                'X-Requested-With': 'XMLHttpRequest',
              },
            });
            sess.saveCookies(r);
            if (r.ok) {
              const j = await r.json();
              const rawM = String(j?.mobile || '');
              const clean = normalizePhone(rawM);
              phoneCache[targetId] = clean || '__EMPTY__';
              if (clean) {
                phoneByRedgitsId.set(targetId, clean);
                fetchedReal++;
              }
            }
          } catch {}
          completed++;
          if (completed % 500 === 0 || completed === ids.length) {
            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
            console.log(
              `   [${tierName}] ${completed}/${ids.length} checked (${fetchedReal} valid phones recovered, ${elapsed}s)`
            );
          }
        }
      })
    );

    fs.writeFileSync(CACHE_FILE, JSON.stringify(phoneCache, null, 2));
    return fetchedReal;
  }

  const activePhonesRecovered = await fetchMobilesForTier('Active/Hold', tierActive);
  const expiredPhonesRecovered = await fetchMobilesForTier('Expired', tierExpired);
  const leadPhonesRecovered = await fetchMobilesForTier('Leads', tierLead);

  // 5. Build Firestore update payload for all clients needing phone or memberId fixes
  const nowIso = new Date().toISOString();
  const updates = [];
  let phonesUpdatedCount = 0;
  let memberIdsUpdatedCount = 0;
  let codePlaceholdersCleaned = 0;

  for (const [, c] of clientByDocId.entries()) {
    const rId = c.rId;
    const patch = {};
    let changed = false;

    // A. Resolve Phone
    const currentRawPhone = String(c.phone || '').trim();
    const currentCleanPhone = normalizePhone(currentRawPhone);
    const resolvedPhone =
      phoneByRedgitsId.get(rId) ||
      currentCleanPhone ||
      (c.memberId ? phoneByCardId.get(String(c.memberId).trim()) : '') ||
      '';

    if (resolvedPhone && resolvedPhone !== currentRawPhone) {
      patch.phone = resolvedPhone;
      patch.redgitsMobileChecked = true;
      phonesUpdatedCount++;
      changed = true;
    } else if (!resolvedPhone && currentRawPhone !== '') {
      // Clear dummy/corrupted phone
      patch.phone = '';
      patch.redgitsMobileChecked = true;
      changed = true;
    } else if (!c.redgitsMobileChecked && rId in phoneCache) {
      patch.redgitsMobileChecked = true;
      changed = true;
    }

    // B. Resolve Member ID (`memberId`)
    const currentRawMemId = c.memberId ? String(c.memberId).trim() : '';
    const isCodePlaceholder = /^code\s*\(/i.test(currentRawMemId);
    const currentCleanMemId = cleanMemberId(currentRawMemId, rId);
    const redgitsTableMemId = memberIdByRedgitsId.get(rId) || '';

    if (c.status === 'Lead') {
      if (currentRawMemId) {
        patch.memberId = FieldValue.delete();
        changed = true;
      }
    } else {
      const targetMemId = redgitsTableMemId || currentCleanMemId;
      if (targetMemId && targetMemId !== currentRawMemId) {
        patch.memberId = targetMemId;
        patch.barcode = targetMemId;
        memberIdsUpdatedCount++;
        if (isCodePlaceholder) codePlaceholdersCleaned++;
        changed = true;
      } else if (!targetMemId && isCodePlaceholder) {
        patch.memberId = FieldValue.delete();
        patch.barcode = c.leadId || rId;
        codePlaceholdersCleaned++;
        changed = true;
      }
    }

    if (changed) {
      patch.updatedAt = nowIso;
      updates.push({ id: c.id, data: patch });
    }
  }

  console.log(
    `5. Committing ${updates.length} client updates to db-inzanathletics (phonesUpdated=${phonesUpdatedCount}, memberIdsUpdated=${memberIdsUpdatedCount}, codePlaceholdersCleaned=${codePlaceholdersCleaned})...`
  );
  await commitUpdatesInBatches(updates);

  const durationMs = Date.now() - startTime;
  await inzanDb
    .collection('settings')
    .doc('redgits_sync_status')
    .set(
      {
        lastSyncAt: nowIso,
        lastSyncBy: 'RedGITS Full Phone & MemberID Resync',
        mode: 'full',
        durationMs,
        status: 'completed',
        phoneResyncStats: {
          activePhonesRecovered,
          expiredPhonesRecovered,
          leadPhonesRecovered,
          phonesUpdatedCount,
          memberIdsUpdatedCount,
          codePlaceholdersCleaned,
        },
      },
      { merge: true }
    );

  console.log('=== Resync Completed Successfully ===');
  console.log({
    durationSec: (durationMs / 1000).toFixed(1),
    activePhonesRecovered,
    expiredPhonesRecovered,
    leadPhonesRecovered,
    phonesUpdatedCount,
    memberIdsUpdatedCount,
    codePlaceholdersCleaned,
  });
}

main().catch((err) => {
  console.error('Fatal error during RedGITS resync:', err);
  process.exit(1);
});
