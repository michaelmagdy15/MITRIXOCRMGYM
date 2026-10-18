/**
 * RedGITS -> Inzan Athletics (`db-inzanathletics`) Full Member Quota, Benefit & Renewal-Days Reconciler
 *
 * Strictly scoped to `faa-test-guide-v2` / `db-inzanathletics`.
 *
 * What this script does:
 * 1. Connects to live RedGITS (`https://inzan.redgits.com`) using BlockIntel fingerprint cookies
 *    and fetches `/admin/members/dashboard/{redgitsId}` for all Active Members (caching in
 *    `docs/redgits_pages/redgits_live_dashboards.json`).
 * 2. Combines:
 *    - Live Dashboard HTML (`My Package` items with exact `Start Date`, `End Date`, `Remaining X Days`,
 *      `Sessions Y`, `Freezing Balance`, `Invitation Balance`, `Total PT / Free / Paid / Taken / Remaining`,
 *      `Coach`, `Total Visits`, `Last Check-in`)
 *    - Deep Sub-Tab Extract (`docs/redgits_pages/redgits_active_deep_extract.json`: `packages` with
 *      `activitiesCount`, `statusRaw` Confirmed/Unconfirmed, `freePt`, `groupClasses`, `frz` freeze history,
 *      `att` attendance history)
 *    - Live Extract V2 (`docs/redgits_pages/redgits_live_extract_v2.json`: `invitations` issued per host member,
 *      `packagesCatalog`, `packageSubscriptions`)
 * 3. Reconciles every member in `db-inzanathletics` (`clients` + `ptPackageRecords`) with exact:
 *    - `daysRemaining` & `membershipExpiry` (true primary membership renewal countdown in Cairo time)
 *    - `packages[]` (both Primary Gym Membership AND Secondary Paid PT / Group PT packages)
 *    - Paid PT Sessions (`paidPtSessionsTotal`, `paidPtSessionsUsed`, `paidPtSessionsRemaining`)
 *    - Free PT Sessions (`freePtSessionsTotal`, `freePtSessionsUsed`, `freePtSessionsRemaining`)
 *    - Guest Invitations (`invitationsTotal`, `invitationsUsed`, `invitationsRemaining`)
 *    - Freeze Allowance Days (`freezeAllowanceDays`, `freezeDaysUsed`, `freezeDaysRemaining`, `freezeCoins`)
 *    - Group Class Trials (`freeClassTrialsTotal`, `freeClassTrialsUsed`, `freeClassTrialsRemaining`)
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

const PROJECT_ID = 'faa-test-guide-v2';
const DATABASE_ID = 'db-inzanathletics';
const REDGITS_ORIGIN = 'https://inzan.redgits.com';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: PROJECT_ID });
}

const inzanDb = getFirestore(DATABASE_ID);
inzanDb.settings({ ignoreUndefinedProperties: true });

export interface ParsedDashboardPackage {
  packageName: string;
  startDate: string;
  endDate: string;
  remainingDays: number | null;
  remainingSessions: number | null;
}

export interface ParsedMemberDashboard {
  redgitsId: string;
  memberId?: string;
  barcode?: string;
  coachName?: string;
  salesName?: string;
  totalVisits?: number;
  lastCheckIn?: string;
  activeSince?: string;
  packageExpiryDate?: string;
  packageExpiryDaysLeft?: number;
  checkInsThisMonth?: number;
  freezingBalance?: number;
  invitationBalance?: number;
  ptTotal?: number;
  ptFree?: number;
  ptPaid?: number;
  ptTaken?: number;
  ptRemaining?: number;
  activePackages: ParsedDashboardPackage[];
}

const MONTHS_MAP: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

export function parseRedgitsHumanDate(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  // e.g. "08 Feb 2026" or "14 Nov 2026"
  const m = trimmed.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (m) {
    const day = m[1]!.padStart(2, '0');
    const mon = MONTHS_MAP[m[2]!.toLowerCase()] || '01';
    const yr = m[3]!;
    return `${yr}-${mon}-${day}`;
  }
  return '';
}

export function computeDaysRemainingFromToday(endDateIso?: string | null, todayCairo?: string): number | null {
  if (!endDateIso || !/^\d{4}-\d{2}-\d{2}/.test(endDateIso)) return null;
  const todayStr =
    todayCairo || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const endMs = Date.parse(`${endDateIso.slice(0, 10)}T00:00:00Z`);
  const todayMs = Date.parse(`${todayStr}T00:00:00Z`);
  if (Number.isNaN(endMs) || Number.isNaN(todayMs)) return null;
  return Math.round((endMs - todayMs) / (1000 * 60 * 60 * 24));
}

export function isPtOrSecondaryPackageName(pkgName?: string, category?: string): boolean {
  const combined = `${pkgName || ''} ${category || ''}`.toLowerCase();
  if (/pt\s*only/i.test(combined) && /membership/i.test(combined)) {
    // e.g. "Annual Membership [PT ONLY]" is a primary gate access membership
    return false;
  }
  return /\bpt\b|private|trainer|group\s*pt|sessions?\s*-\s*group|inbody|nutrition|physio|spa|massage|assessment/i.test(
    combined
  );
}

export function parseSessionsFromPackageName(pkgName: string, expiryDays = 30): number {
  const m = pkgName.match(/(\d+)\s*(?:session|sessions|class|classes|pt|s\b)/i);
  if (m && m[1]) return parseInt(m[1], 10);
  if (/drop-?in|single|1\s*day/i.test(pkgName)) return 1;
  if (/basic\s*membership|annual|year|12\s*month/i.test(pkgName)) return Math.max(expiryDays, 365);
  if (/6\s*month/i.test(pkgName)) return Math.max(expiryDays, 180);
  if (/3\s*month/i.test(pkgName)) return Math.max(expiryDays, 90);
  if (/1\s*month|monthly/i.test(pkgName)) return Math.max(expiryDays, 30);
  return expiryDays > 0 ? expiryDays : 30;
}

export function parseDashboardHtml(redgitsId: string, html: string): ParsedMemberDashboard | null {
  if (!html || (!html.includes('Freezing Balance') && !html.includes('My Package'))) {
    return null;
  }

  const activePackages: ParsedDashboardPackage[] = [];
  const itemRegex = /<div class="mpd-package-item">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  const itemSplits = html.split(/<div class="mpd-package-item">/i).slice(1);
  for (const rawBlock of itemSplits) {
    const block = rawBlock.split(/<button|<div class="mpd-side"/i)[0] || rawBlock;
    const titleMatch = block.match(/<div class="mpd-package-item-title">([\s\S]*?)<\/div>/i);
    const pkgTitle = titleMatch ? titleMatch[1]!.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
    if (!pkgTitle) continue;

    const startMatch = block.match(/Start Date<\/span>\s*<strong>([\s\S]*?)<\/strong>/i);
    const endMatch = block.match(/End Date<\/span>\s*<strong>([\s\S]*?)<\/strong>/i);
    const remDaysMatch = block.match(/Remaining<\/span>\s*<strong[^>]*>\s*(-?\d+)\s*Days/i);
    const sessMatch = block.match(/Sessions<\/span>\s*<strong>\s*(\d+)\s*<\/strong>/i);

    activePackages.push({
      packageName: pkgTitle,
      startDate: parseRedgitsHumanDate(startMatch?.[1]),
      endDate: parseRedgitsHumanDate(endMatch?.[1]),
      remainingDays: remDaysMatch?.[1] !== undefined ? parseInt(remDaysMatch[1], 10) : null,
      remainingSessions: sessMatch?.[1] !== undefined ? parseInt(sessMatch[1], 10) : null,
    });
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const memberIdMatch = text.match(/Member ID:\s*([^\s]+)\s*Copy/i);
  const coachMatch = text.match(/Coach:\s*(.+?)(?=\s+Sales:|\s+\d+\s+Total Visits)/i);
  const salesMatch = text.match(/Sales:\s*(.+?)(?=\s+\d+\s+Total Visits|\s+Age:)/i);
  const visitsMatch = text.match(/(\d+)\s+Total Visits/i);
  const lastCheckInMatch = text.match(/Last Check-in:\s*(.+?)(?=\s+Coach:|\s+Sales:|\s+\d+\s+Total Visits)/i);
  const activeSinceMatch = text.match(/Active Since\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i);
  const pkgExpiryMatch = text.match(/Package Expiry\s+(-?\d+)\s+Days Left\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i);
  const checkInsMonthMatch = text.match(/Total Check-ins\s+(\d+)\s+This Month/i);

  const frzMatch = text.match(/Freezing Balance:\s*(\d+)/i);
  const invMatch = text.match(/Invitation Balance:\s*(\d+)/i);
  const ptMatch = text.match(
    /Total PT\s*(\d+)\s*Free\s*(\d+)\s*Paid\s*(\d+)\s*Taken\s*(\d+)\s*Remaining\s*(\d+)/i
  );

  const cleanCoach = coachMatch?.[1]?.trim();
  const coachName =
    cleanCoach && cleanCoach !== '-' && cleanCoach !== '0' && cleanCoach.toLowerCase() !== 'none'
      ? cleanCoach
      : undefined;

  return {
    redgitsId,
    memberId: memberIdMatch?.[1]?.trim(),
    coachName,
    salesName: salesMatch?.[1]?.trim(),
    totalVisits: visitsMatch?.[1] ? parseInt(visitsMatch[1], 10) : undefined,
    lastCheckIn: lastCheckInMatch?.[1]?.trim(),
    activeSince: parseRedgitsHumanDate(activeSinceMatch?.[1]),
    packageExpiryDaysLeft: pkgExpiryMatch?.[1] ? parseInt(pkgExpiryMatch[1], 10) : undefined,
    packageExpiryDate: parseRedgitsHumanDate(pkgExpiryMatch?.[2]),
    checkInsThisMonth: checkInsMonthMatch?.[1] ? parseInt(checkInsMonthMatch[1], 10) : undefined,
    freezingBalance: frzMatch?.[1] !== undefined ? parseInt(frzMatch[1], 10) : undefined,
    invitationBalance: invMatch?.[1] !== undefined ? parseInt(invMatch[1], 10) : undefined,
    ptTotal: ptMatch?.[1] !== undefined ? parseInt(ptMatch[1], 10) : undefined,
    ptFree: ptMatch?.[2] !== undefined ? parseInt(ptMatch[2], 10) : undefined,
    ptPaid: ptMatch?.[3] !== undefined ? parseInt(ptMatch[3], 10) : undefined,
    ptTaken: ptMatch?.[4] !== undefined ? parseInt(ptMatch[4], 10) : undefined,
    ptRemaining: ptMatch?.[5] !== undefined ? parseInt(ptMatch[5], 10) : undefined,
    activePackages,
  };
}

async function fetchLiveDashboardsFromRedgits(
  activeIds: string[],
  cachePath: string,
  forceRefresh = false
): Promise<Record<string, ParsedMemberDashboard>> {
  let cached: Record<string, ParsedMemberDashboard> = {};
  if (fs.existsSync(cachePath) && !forceRefresh) {
    try {
      cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch {
      cached = {};
    }
  }

  const missingIds = activeIds.filter((id) => !cached[id]);
  if (missingIds.length === 0) {
    console.log(`  • Loaded ${Object.keys(cached).length} live member dashboards from cache.`);
    return cached;
  }

  console.log(`  • Fetching ${missingIds.length} live member dashboards from https://inzan.redgits.com ...`);

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
    const setCookies =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : (response.headers.get('set-cookie') || '').split(/,(?=\s*[a-zA-Z0-9_-]+=)/);
    for (const c of setCookies) {
      const [kv] = c.split(';');
      if (!kv) continue;
      const eq = kv.indexOf('=');
      if (eq > 0) {
        const k = kv.slice(0, eq).trim();
        const v = kv.slice(eq + 1).trim();
        if (v && v !== 'deleted') cookieJar.set(k, v);
      }
    }
  };
  const getCookieHeader = () =>
    Array.from(cookieJar.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

  const r0 = await fetch(`${REDGITS_ORIGIN}/admin/login`, {
    headers: { Cookie: getCookieHeader(), 'User-Agent': USER_AGENT },
  });
  saveCookies(r0);

  const loginBody = new URLSearchParams({
    username: process.env.REDGITS_USERNAME || 'mi5a',
    password: process.env.REDGITS_PASSWORD || 'Miko0019_!',
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
  });

  const r1 = await fetch(`${REDGITS_ORIGIN}/admin/login/check_login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Cookie: getCookieHeader(),
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: REDGITS_ORIGIN,
      Referer: `${REDGITS_ORIGIN}/admin/login`,
    },
    body: loginBody.toString(),
  });
  saveCookies(r1);

  let idx = 0;
  let fetchedCount = 0;
  const startTime = Date.now();
  const CONCURRENCY = 14;

  const worker = async () => {
    while (idx < missingIds.length) {
      const rId = missingIds[idx++];
      if (!rId) continue;
      try {
        const res = await fetch(`${REDGITS_ORIGIN}/admin/members/dashboard/${rId}`, {
          headers: {
            Cookie: getCookieHeader(),
            'User-Agent': USER_AGENT,
            'X-Requested-With': 'XMLHttpRequest',
          },
        });
        if (res.ok) {
          const html = await res.text();
          const parsed = parseDashboardHtml(rId, html);
          if (parsed) {
            cached[rId] = parsed;
          }
        }
      } catch {
        // ignore single error
      }
      fetchedCount++;
      if (fetchedCount % 200 === 0 || fetchedCount === missingIds.length) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(
          `    [Live Dashboard Scan] ${fetchedCount}/${missingIds.length} (${Object.keys(cached).length} parsed, ${elapsed}s)`
        );
        fs.writeFileSync(cachePath, JSON.stringify(cached, null, 2), 'utf8');
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  fs.writeFileSync(cachePath, JSON.stringify(cached, null, 2), 'utf8');
  return cached;
}

async function main() {
  const globalStart = Date.now();
  const forceRefresh = process.argv.includes('--refresh');
  const todayCairo = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const nowIso = new Date().toISOString();

  console.log('================================================================================');
  console.log(` RedGITS -> Inzan Athletics (${DATABASE_ID}) Quota & Benefit Reconciliation Engine`);
  console.log(` Cairo Date: ${todayCairo}`);
  console.log('================================================================================\n');

  const deepPath = path.resolve(process.cwd(), 'docs/redgits_pages/redgits_active_deep_extract.json');
  const liveV2Path = path.resolve(process.cwd(), 'docs/redgits_pages/redgits_live_extract_v2.json');
  const dashCachePath = path.resolve(process.cwd(), 'docs/redgits_pages/redgits_live_dashboards.json');

  const deepExtract = fs.existsSync(deepPath)
    ? JSON.parse(fs.readFileSync(deepPath, 'utf8'))
    : { activeDeep: {} };
  const liveV2 = fs.existsSync(liveV2Path)
    ? JSON.parse(fs.readFileSync(liveV2Path, 'utf8'))
    : { tables: {} };

  const activeDeepMap: Record<string, any> = deepExtract.activeDeep || {};

  // 1. Collect all active RedGITS IDs from both `activeDeep` and `activeMembers` table
  const activeRows: string[][] = liveV2.tables?.activeMembers?.rows || [];
  const activeIdsSet = new Set<string>(Object.keys(activeDeepMap));
  for (const row of activeRows) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const m = row.join(' ').match(/\[ID:(\d+)\]/);
    const id = m?.[1] ? m[1] : /^\d+$/.test(row[0] || '') ? String(row[0]) : '';
    if (id) activeIdsSet.add(id);
  }
  const activeIds = Array.from(activeIdsSet);

  // 2. Fetch / Load Live Dashboards from RedGITS
  const dashboardsByRedgitsId = await fetchLiveDashboardsFromRedgits(activeIds, dashCachePath, forceRefresh);

  // 3. Index Guest Invitations issued per host member
  const invRows: string[][] = liveV2.tables?.invitations?.rows || [];
  const invitationsSnap = await inzanDb.collection('guestInvites').get();
  const invitesUsedByHostId = new Map<string, number>();
  const invitesUsedByHostName = new Map<string, number>();

  const seenGuestCodes = new Set<string>();
  for (const iRow of invRows) {
    if (!Array.isArray(iRow) || iRow.length < 6) continue;
    const guestCode = String(iRow[0] || '').trim();
    if (guestCode && seenGuestCodes.has(guestCode)) continue;
    if (guestCode) seenGuestCodes.add(guestCode);

    const hostName = String(iRow[3] || iRow[4] || '').trim().toLowerCase();
    const hostMemberId = String(iRow[4] || iRow[5] || '').trim();
    if (hostMemberId && /^\d+$/.test(hostMemberId)) {
      invitesUsedByHostId.set(hostMemberId, (invitesUsedByHostId.get(hostMemberId) || 0) + 1);
    }
    if (hostName && !/^\d+$/.test(hostName)) {
      invitesUsedByHostName.set(hostName, (invitesUsedByHostName.get(hostName) || 0) + 1);
    }
  }
  for (const docSnap of invitationsSnap.docs) {
    const d = docSnap.data();
    const gCode = String(d.guestCode || docSnap.id).trim();
    if (gCode && seenGuestCodes.has(gCode)) continue;
    if (gCode) seenGuestCodes.add(gCode);
    const hId = String(d.hostMemberId || '').trim();
    const hName = String(d.hostMemberName || '').trim().toLowerCase();
    if (hId) invitesUsedByHostId.set(hId, (invitesUsedByHostId.get(hId) || 0) + 1);
    if (hName) invitesUsedByHostName.set(hName, (invitesUsedByHostName.get(hName) || 0) + 1);
  }

  // 4. Load Packages Catalog from `db-inzanathletics`
  const pkgSnap = await inzanDb.collection('packages').get();
  const catalogByLowerName = new Map<string, Record<string, any>>();
  for (const docSnap of pkgSnap.docs) {
    const data = docSnap.data();
    if (data?.name) {
      catalogByLowerName.set(String(data.name).trim().toLowerCase(), { id: docSnap.id, ...data });
    }
  }

  const resolveCatalogPackage = (rawName?: string): Record<string, any> | null => {
    if (!rawName) return null;
    const clean = rawName.replace(/\s*\(\s*\d+\s*\)\s*$/, '').trim().toLowerCase();
    if (catalogByLowerName.has(clean)) return catalogByLowerName.get(clean)!;
    for (const [k, v] of catalogByLowerName.entries()) {
      if (clean.includes(k) || k.includes(clean)) return v;
    }
    return null;
  };

  // 5. Load Coaches from `db-inzanathletics` to map Coach Names -> Coach IDs
  const coachesSnap = await inzanDb.collection('coaches').get();
  const coachByLowerName = new Map<string, { id: string; name: string }>();
  for (const docSnap of coachesSnap.docs) {
    const d = docSnap.data();
    const cName = String(d.name || '').trim();
    if (cName) {
      coachByLowerName.set(cName.toLowerCase(), { id: docSnap.id, name: cName });
    }
  }
  const resolveCoach = (rawCoachName?: string, pkgName?: string): { id?: string; name?: string } => {
    let candidate = (rawCoachName || '').trim();
    if (!candidate || candidate === '0' || candidate === '-') {
      // Check if package name embeds coach e.g. "[ C.Bezo ]" or "[ C.Kogy ]"
      const bracketMatch = (pkgName || '').match(/\[\s*(?:C\.|Coach\s*)?([A-Za-z0-9\s]+?)\s*\]/i);
      if (bracketMatch?.[1] && !/old\s*rate|pt\s*only|summer|offer|\d/i.test(bracketMatch[1])) {
        candidate = bracketMatch[1].trim();
      }
    }
    if (!candidate || candidate === '0' || candidate === '-') return {};
    const lower = candidate.toLowerCase().replace(/^c\.\s*/i, '').trim();
    if (coachByLowerName.has(lower)) return coachByLowerName.get(lower)!;
    if (lower === 'bezo' && coachByLowerName.has('beezo')) return coachByLowerName.get('beezo')!;
    for (const [k, v] of coachByLowerName.entries()) {
      if (k.includes(lower) || lower.includes(k)) return v;
    }
    return { name: candidate };
  };

  // 6. Load all Clients from `db-inzanathletics` and reconcile member by member
  const clientsSnap = await inzanDb.collection('clients').get();
  console.log(`  • Scanning and reconciling ${clientsSnap.size} member & lead records in db-inzanathletics...\n`);

  const clientUpdates: Array<{ id: string; data: Record<string, any> }> = [];
  const ptPackageWrites: Array<{ id: string; data: Record<string, any> }> = [];

  let reconciledActiveMembers = 0;
  let reconciledNearlyExpired = 0;
  let reconciledHoldMembers = 0;
  let reconciledPtPackages = 0;
  let reconciledFreePtMembers = 0;
  let reconciledFreezeMembers = 0;
  let reconciledInviteMembers = 0;

  for (const clientDoc of clientsSnap.docs) {
    const client = clientDoc.data();
    const clientDocId = clientDoc.id;
    const rId = String(client.redgitsId || clientDocId.replace(/^redgits-/, '')).trim();
    const cardMemberId = String(client.memberId || rId).trim();

    if (client.status === 'Lead') continue;

    const dash = dashboardsByRedgitsId[rId];
    const deep = activeDeepMap[rId];

    // Reconcile Freeze History from `deep.frz`
    const frzRows: string[][] = deep?.frz || [];
    const freezeHistory =
      frzRows.length > 0
        ? frzRows.map((fr, idx) => ({
            id: `frz-${rId}-${idx + 1}`,
            packageName: String(fr[1] || client.packageType || 'Basic Membership')
              .replace(/\s*\(\s*\d+\s*\)\s*$/, '')
              .trim(),
            days: parseInt(String(fr[2] || '0'), 10) || 0,
            startDate: fr[3] || '',
            endDate: fr[4] || '',
            createdBy: fr[5] || '',
            createdAt: fr[6] || '',
            freezeType: fr[7] || 'Normal Freezing',
          }))
        : Array.isArray(client.freezeHistory)
        ? client.freezeHistory
        : [];

    const freezeDaysUsedFromHistory = freezeHistory.reduce(
      (sum: number, f: any) => sum + (Number(f?.days) || 0),
      0
    );
    const isCurrentlyInFreezeWindow = freezeHistory.some(
      (f: any) => f.startDate && f.endDate && f.startDate <= todayCairo && todayCairo <= f.endDate
    );

    // Reconcile Invitations Used from `guestInvites` / `invRows`
    const invitesUsedById =
      (invitesUsedByHostId.get(cardMemberId) || 0) +
      (cardMemberId !== rId ? invitesUsedByHostId.get(rId) || 0 : 0);
    const invitesUsedByName = client.name
      ? invitesUsedByHostName.get(String(client.name).trim().toLowerCase()) || 0
      : 0;
    const actualInvitationsUsed = Math.max(
      invitesUsedById,
      invitesUsedByName,
      Number(client.invitationsUsed) || 0
    );

    // Reconcile Packages List (combining `dash.activePackages` + `deep.packages` + existing `client.packages`)
    const deepPackages: any[] = Array.isArray(deep?.packages) ? deep.packages : [];
    const dashPackages: ParsedDashboardPackage[] = dash?.activePackages || [];

    const mergedPackages: Array<Record<string, any>> = [];
    const seenPkgKeys = new Set<string>();

    // Helper to build a normalized package entry
    const buildPackageEntry = (params: {
      id: string;
      packageName: string;
      startDate: string;
      endDate: string;
      statusRaw: string;
      remainingSessions: number | null;
      remainingDays: number | null;
      activitiesCount: number;
      freePt: number;
      groupClasses: number;
      createdOn?: string;
      createdBy?: string;
      targetSales?: string;
    }) => {
      const catPkg = resolveCatalogPackage(params.packageName);
      const isSecondaryPt = isPtOrSecondaryPackageName(params.packageName, catPkg?.category);
      const totalSessions =
        catPkg?.sessions ||
        catPkg?.expiryDays ||
        parseSessionsFromPackageName(params.packageName, catPkg?.expiryDays || 30);

      const isFinished =
        /finish|expir/i.test(params.statusRaw) ||
        (params.endDate && params.endDate < todayCairo && !/active/i.test(params.statusRaw));
      const isHold = /hold|freez/i.test(params.statusRaw) || isCurrentlyInFreezeWindow;
      const isUnconfirmed = /unconfirmed/i.test(params.statusRaw);

      const computedRemainingSessions =
        params.remainingSessions !== null && params.remainingSessions !== undefined
          ? params.remainingSessions
          : isFinished
          ? 0
          : Math.max(0, totalSessions - (params.activitiesCount || 0));

      const usedSessions = Math.max(
        params.activitiesCount || 0,
        Math.max(0, totalSessions - computedRemainingSessions)
      );

      const calcDaysLeft =
        params.remainingDays !== null && params.remainingDays !== undefined
          ? params.remainingDays
          : computeDaysRemainingFromToday(params.endDate, todayCairo);

      const pkgCoach = resolveCoach(dash?.coachName || client.trainerName, params.packageName);

      const catInvites = catPkg?.guestInvitations ?? catPkg?.invitationsTotal ?? (isSecondaryPt ? 0 : 3);
      const catFreeze = catPkg?.freezeAllowanceDays ?? catPkg?.freezeLimitDays ?? (isSecondaryPt ? 0 : 30);
      const catFreePt =
        params.freePt > 0 ? params.freePt : catPkg?.freePtSessions ?? (isSecondaryPt ? 0 : 0);
      const catClasses =
        params.groupClasses > 0
          ? params.groupClasses
          : catPkg?.freeClassTrials ?? (isSecondaryPt ? 0 : 0);

      return {
        id: params.id,
        packageId: catPkg?.id || `redgits-pkg-${params.packageName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        packageName: params.packageName,
        category: isSecondaryPt ? 'PT' : catPkg?.category || 'Membership',
        hierarchyType: isSecondaryPt ? 'Secondary' : catPkg?.hierarchyType || 'Primary',
        status: isHold ? 'Frozen' : isFinished ? 'Expired' : 'Active',
        statusRaw: params.statusRaw,
        financeConfirmed: !isUnconfirmed,
        startDate: params.startDate || client.startDate || todayCairo,
        endDate: params.endDate || undefined,
        daysRemaining: isFinished ? 0 : calcDaysLeft ?? 0,
        totalSessions,
        sessionsTotal: totalSessions,
        usedSessions,
        sessionsUsed: usedSessions,
        sessionsRemaining: isFinished ? 0 : computedRemainingSessions,
        activitiesCount: params.activitiesCount || usedSessions,
        pricePaid: catPkg?.price ?? 0,
        guestInvitations: catInvites,
        invitationsTotal: catInvites,
        freezeAllowanceDays: catFreeze,
        freezeLimitDays: catFreeze,
        minFreezeDays: catPkg?.minFreezeDays ?? (catFreeze > 0 ? 7 : 0),
        maxFreezeDays: catPkg?.maxFreezeDays ?? catFreeze,
        freePtSessions: catFreePt,
        freeClassTrials: catClasses,
        trainerId: pkgCoach.id,
        trainerName: pkgCoach.name,
        createdAt: params.createdOn || params.startDate || nowIso,
        createdBy: params.createdBy,
        targetSales: params.targetSales,
      };
    };

    // First, merge `dashPackages` with `deepPackages` so we get live `remainingDays` & `remainingSessions` + deep metadata
    for (let i = 0; i < dashPackages.length; i++) {
      const dPkg = dashPackages[i]!;
      const matchingDeep = deepPackages.find(
        (dp) =>
          String(dp.packageName || '').trim().toLowerCase() === dPkg.packageName.trim().toLowerCase() &&
          (!dPkg.startDate || !dp.startDate || dp.startDate === dPkg.startDate)
      );
      const key = `${dPkg.packageName.trim().toLowerCase()}|${dPkg.startDate || matchingDeep?.startDate || ''}`;
      if (seenPkgKeys.has(key)) continue;
      seenPkgKeys.add(key);

      mergedPackages.push(
        buildPackageEntry({
          id: `pkg-live-${rId}-${i + 1}`,
          packageName: dPkg.packageName,
          startDate: dPkg.startDate || matchingDeep?.startDate || client.startDate || todayCairo,
          endDate: dPkg.endDate || matchingDeep?.endDate || client.membershipExpiry || '',
          statusRaw: matchingDeep?.statusRaw || (client.status === 'Hold' ? 'Hold' : 'Active'),
          remainingSessions: dPkg.remainingSessions ?? matchingDeep?.remainingSessions ?? null,
          remainingDays: dPkg.remainingDays,
          activitiesCount: matchingDeep?.activitiesCount ?? 0,
          freePt: matchingDeep?.freePt ?? 0,
          groupClasses: matchingDeep?.groupClasses ?? 0,
          createdOn: matchingDeep?.createdOn,
          createdBy: matchingDeep?.createdBy,
          targetSales: matchingDeep?.targetSales,
        })
      );
    }

    // Next, include any `deepPackages` not already in `dashPackages` (e.g. historical Finished packages or active packages)
    for (let j = 0; j < deepPackages.length; j++) {
      const dp = deepPackages[j]!;
      if (!dp?.packageName) continue;
      const key = `${String(dp.packageName).trim().toLowerCase()}|${dp.startDate || ''}`;
      if (seenPkgKeys.has(key)) continue;
      seenPkgKeys.add(key);

      mergedPackages.push(
        buildPackageEntry({
          id: `pkg-deep-${rId}-${j + 1}`,
          packageName: dp.packageName,
          startDate: dp.startDate || client.startDate || todayCairo,
          endDate: dp.endDate || '',
          statusRaw: dp.statusRaw || 'Finished',
          remainingSessions: dp.remainingSessions ?? null,
          remainingDays: null,
          activitiesCount: dp.activitiesCount ?? 0,
          freePt: dp.freePt ?? 0,
          groupClasses: dp.groupClasses ?? 0,
          createdOn: dp.createdOn,
          createdBy: dp.createdBy,
          targetSales: dp.targetSales,
        })
      );
    }

    // Fallback for expired members who weren't in `dash` or `deep`
    if (mergedPackages.length === 0 && Array.isArray(client.packages) && client.packages.length > 0) {
      for (const ep of client.packages) {
        const calcDays = computeDaysRemainingFromToday(ep.endDate || client.membershipExpiry, todayCairo);
        mergedPackages.push({
          ...ep,
          daysRemaining: ep.status === 'Expired' ? 0 : calcDays ?? 0,
        });
      }
    }

    // Separate Primary Gym Membership from Secondary PT Packages
    const activePkgs = mergedPackages.filter((p) => p.status === 'Active' || p.status === 'Frozen');
    const activePrimaryPkg =
      activePkgs.find((p) => !isPtOrSecondaryPackageName(p.packageName, p.category)) ||
      activePkgs[0] ||
      mergedPackages.find((p) => !isPtOrSecondaryPackageName(p.packageName, p.category)) ||
      mergedPackages[0];

    const activePtPkgs = activePkgs.filter((p) => isPtOrSecondaryPackageName(p.packageName, p.category));

    // Determine True Primary Membership Expiry & Remaining Days to Renew
    const trueMembershipExpiry =
      activePrimaryPkg?.endDate ||
      dash?.packageExpiryDate ||
      client.membershipExpiry ||
      null;

    const computedDaysToRenew =
      activePrimaryPkg?.daysRemaining !== undefined && activePrimaryPkg.status !== 'Expired'
        ? activePrimaryPkg.daysRemaining
        : dash?.packageExpiryDaysLeft !== undefined
        ? dash.packageExpiryDaysLeft
        : computeDaysRemainingFromToday(trueMembershipExpiry, todayCairo);

    const daysRemaining =
      client.status === 'Expired' && activePkgs.length === 0
        ? Math.min(0, computedDaysToRenew ?? 0)
        : computedDaysToRenew ?? 0;

    // Reconcile Paid PT & Free PT Quotas
    const sumPtPkgTotal = activePtPkgs.reduce((acc, p) => acc + (Number(p.totalSessions) || 0), 0);
    const sumPtPkgRemaining = activePtPkgs.reduce((acc, p) => acc + (Number(p.sessionsRemaining) || 0), 0);
    const sumPtPkgUsed = activePtPkgs.reduce((acc, p) => acc + (Number(p.usedSessions) || 0), 0);

    const dashPtFree = dash?.ptFree ?? 0;
    const dashPtPaid = dash?.ptPaid ?? 0;
    const dashPtTaken = dash?.ptTaken ?? 0;
    const dashPtRemaining = dash?.ptRemaining ?? 0;

    const deepFreePtQuota = mergedPackages
      .filter((p) => p.status !== 'Expired')
      .reduce((acc, p) => acc + (Number(p.freePtSessions) || 0), 0);

    const freePtSessionsTotal = Math.max(dashPtFree, deepFreePtQuota, Number(client.freePtSessionsTotal) || 0);
    // If RedGITS dashboard reports Taken PT sessions, attribute taken sessions to Free PT first if Paid PT has its own package counter
    const freePtSessionsUsed =
      dashPtFree > 0 && dashPtPaid === 0
        ? Math.min(freePtSessionsTotal, dashPtTaken)
        : Math.min(freePtSessionsTotal, Number(client.freePtSessionsUsed) || 0);
    const freePtSessionsRemaining = Math.max(0, freePtSessionsTotal - freePtSessionsUsed);

    const paidPtSessionsTotal = Math.max(sumPtPkgTotal, dashPtPaid);
    const paidPtSessionsRemaining =
      activePtPkgs.length > 0
        ? sumPtPkgRemaining
        : dashPtPaid > 0
        ? Math.max(0, dashPtRemaining - freePtSessionsRemaining)
        : 0;
    const paidPtSessionsUsed = Math.max(sumPtPkgUsed, Math.max(0, paidPtSessionsTotal - paidPtSessionsRemaining));

    // Reconcile Freeze Quotas
    const catalogFreezeQuota =
      activePrimaryPkg?.freezeAllowanceDays ?? Number(client.freezeAllowanceDays || client.freezeLimitDays || 30);
    const freezeDaysRemaining =
      dash?.freezingBalance !== undefined
        ? dash.freezingBalance
        : Math.max(0, catalogFreezeQuota - freezeDaysUsedFromHistory);
    const freezeDaysUsed = freezeDaysUsedFromHistory;
    const freezeAllowanceDays = Math.max(catalogFreezeQuota, freezeDaysRemaining + freezeDaysUsed);

    // Reconcile Guest Invitations Quotas
    const catalogInviteQuota =
      activePrimaryPkg?.guestInvitations ?? Number(client.invitationsTotal || client.guestInvitations || 3);
    const invitationsRemaining =
      dash?.invitationBalance !== undefined
        ? dash.invitationBalance
        : Math.max(0, catalogInviteQuota - actualInvitationsUsed);
    const invitationsTotal = Math.max(catalogInviteQuota, invitationsRemaining + actualInvitationsUsed);

    // Reconcile Group Class Trials
    const freeClassTrialsTotal = mergedPackages
      .filter((p) => p.status !== 'Expired')
      .reduce((acc, p) => acc + (Number(p.freeClassTrials) || 0), 0);
    const freeClassTrialsUsed = Number(client.freeClassTrialsUsed) || 0;
    const freeClassTrialsRemaining = Math.max(0, freeClassTrialsTotal - freeClassTrialsUsed);

    // Stamp reconciled benefit balances back onto the primary package inside `mergedPackages` so UI cards display exact used/remaining
    if (activePrimaryPkg) {
      activePrimaryPkg.invitationsTotal = invitationsTotal;
      activePrimaryPkg.guestInvitations = invitationsTotal;
      activePrimaryPkg.invitationsUsed = actualInvitationsUsed;
      activePrimaryPkg.invitationsRemaining = invitationsRemaining;
      activePrimaryPkg.freezeAllowanceDays = freezeAllowanceDays;
      activePrimaryPkg.freezeLimitDays = freezeAllowanceDays;
      activePrimaryPkg.freezeDaysUsed = freezeDaysUsed;
      activePrimaryPkg.freezeDaysRemaining = freezeDaysRemaining;
      activePrimaryPkg.freePtSessions = freePtSessionsTotal;
      activePrimaryPkg.freePtSessionsUsed = freePtSessionsUsed;
      activePrimaryPkg.freePtSessionsRemaining = freePtSessionsRemaining;
      activePrimaryPkg.freeClassTrials = freeClassTrialsTotal;
      activePrimaryPkg.freeClassTrialsUsed = freeClassTrialsUsed;
      activePrimaryPkg.freeClassTrialsRemaining = freeClassTrialsRemaining;
    }

    // Resolve Coach Assignment
    const resolvedCoach = resolveCoach(
      dash?.coachName || client.trainerName || activePtPkgs[0]?.trainerName,
      activePtPkgs[0]?.packageName || activePrimaryPkg?.packageName
    );

    // Determine effective top-level status & sessionsRemaining
    let effectiveStatus: string = client.status || 'Active';
    if (isCurrentlyInFreezeWindow || client.status === 'Hold') {
      effectiveStatus = 'Hold';
      reconciledHoldMembers++;
    } else if (activePkgs.length > 0 && daysRemaining >= 0) {
      effectiveStatus = 'Active';
      reconciledActiveMembers++;
      if (daysRemaining <= 7) {
        reconciledNearlyExpired++;
      }
    }

    const primarySessionsRemaining =
      effectiveStatus === 'Expired'
        ? 0
        : activePrimaryPkg?.sessionsRemaining ?? Number(client.sessionsRemaining) ?? 0;

    if (paidPtSessionsTotal > 0) reconciledPtPackages++;
    if (freePtSessionsTotal > 0) reconciledFreePtMembers++;
    if (freezeDaysUsed > 0 || freezeDaysRemaining > 0) reconciledFreezeMembers++;
    if (actualInvitationsUsed > 0 || invitationsRemaining > 0) reconciledInviteMembers++;

    const updatePayload: Record<string, any> = {
      status: effectiveStatus,
      packageType: activePrimaryPkg?.packageName || client.packageType || 'Basic Membership',
      startDate: activePrimaryPkg?.startDate || dash?.activeSince || client.startDate,
      membershipExpiry: trueMembershipExpiry,
      daysRemaining,
      isNearlyExpired: effectiveStatus === 'Active' && daysRemaining >= 0 && daysRemaining <= 7,
      sessionsRemaining: primarySessionsRemaining,
      // Paid PT Quotas
      paidPtSessionsTotal,
      paidPtSessionsUsed,
      paidPtSessionsRemaining,
      // Free PT Quotas
      freePtSessionsTotal,
      freePtSessionsUsed,
      freePtSessionsRemaining,
      // Total PT Summary (Paid + Free)
      ptSessionsTotal: paidPtSessionsTotal + freePtSessionsTotal,
      ptSessionsUsed: paidPtSessionsUsed + freePtSessionsUsed,
      ptSessionsRemaining: paidPtSessionsRemaining + freePtSessionsRemaining,
      // Guest Invitations Quotas
      invitationsTotal,
      guestInvitations: invitationsTotal,
      invitationsUsed: actualInvitationsUsed,
      invitationsRemaining,
      // Freeze Allowance Quotas
      freezeAllowanceDays,
      freezeLimitDays: freezeAllowanceDays,
      freezeDaysUsed,
      freezeDaysRemaining,
      freezeCoins: freezeDaysRemaining,
      freezeHistory: freezeHistory.length > 0 ? freezeHistory : undefined,
      // Class Trials
      freeClassTrialsTotal,
      freeClassTrialsUsed,
      freeClassTrialsRemaining,
      // Attendance & Coach
      totalVisitsCount: dash?.totalVisits ?? client.totalVisitsCount ?? (deep?.att?.length || 0),
      lastCheckInAt: dash?.lastCheckIn || client.lastCheckInAt || undefined,
      trainerName: resolvedCoach.name || client.trainerName || undefined,
      assignedCoachId: resolvedCoach.id || client.assignedCoachId || undefined,
      assignedCoachName: resolvedCoach.name || client.assignedCoachName || client.trainerName || undefined,
      packages: mergedPackages.length > 0 ? mergedPackages : undefined,
      quotasReconciledAt: nowIso,
    };

    Object.keys(updatePayload).forEach((k) => updatePayload[k] === undefined && delete updatePayload[k]);
    clientUpdates.push({ id: clientDocId, data: updatePayload });

    // Create / sync `ptPackageRecords` for every active Paid PT package so Coach Portal & PT tracking work seamlessly
    for (let pIdx = 0; pIdx < activePtPkgs.length; pIdx++) {
      const ptPkg = activePtPkgs[pIdx]!;
      const ptRecordId = `redgits-ptpkg-${rId}-${pIdx + 1}`;
      ptPackageWrites.push({
        id: ptRecordId,
        data: {
          id: ptRecordId,
          clientId: clientDocId,
          clientName: client.name,
          memberId: cardMemberId,
          packageName: ptPkg.packageName,
          totalSessions: ptPkg.totalSessions,
          usedSessions: ptPkg.usedSessions,
          remainingSessions: ptPkg.sessionsRemaining,
          sessionsRemaining: ptPkg.sessionsRemaining,
          startDate: ptPkg.startDate,
          endDate: ptPkg.endDate,
          daysRemaining: ptPkg.daysRemaining,
          coachId: ptPkg.trainerId || resolvedCoach.id || '',
          coachName: ptPkg.trainerName || resolvedCoach.name || '',
          status: ptPkg.status === 'Frozen' ? 'Hold' : 'Active',
          sourceSystem: 'RedGITS_v17.12',
          updatedAt: nowIso,
        },
      });
    }
  }

  console.log('Reconciliation Summary:');
  console.log(`  • Active Members Reconciled        : ${reconciledActiveMembers}`);
  console.log(`  • Nearly Expired (<= 7 Days Left)  : ${reconciledNearlyExpired}`);
  console.log(`  • Members Currently on Hold/Freeze : ${reconciledHoldMembers}`);
  console.log(`  • Members with Active Paid PT      : ${reconciledPtPackages} (${ptPackageWrites.length} PT package records)`);
  console.log(`  • Members with Free PT Quotas      : ${reconciledFreePtMembers}`);
  console.log(`  • Members with Freeze Balances     : ${reconciledFreezeMembers}`);
  console.log(`  • Members with Invitation Balances : ${reconciledInviteMembers}\n`);

  // Commit in parallel batches
  const commitCollection = async (col: string, items: Array<{ id: string; data: Record<string, any> }>) => {
    if (items.length === 0) return;
    const BATCH_SIZE = 400;
    const CONCURRENCY = 6;
    const chunks: Array<typeof items> = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      chunks.push(items.slice(i, i + BATCH_SIZE));
    }
    let done = 0;
    for (let c = 0; c < chunks.length; c += CONCURRENCY) {
      const group = chunks.slice(c, c + CONCURRENCY);
      await Promise.all(
        group.map(async (chunk) => {
          const batch = inzanDb.batch();
          for (const item of chunk) {
            batch.set(inzanDb.collection(col).doc(item.id), item.data, { merge: true });
          }
          await batch.commit();
        })
      );
      done += group.reduce((acc, g) => acc + g.length, 0);
      console.log(`  -> Committed ${done}/${items.length} to ${col}`);
    }
  };

  await commitCollection('clients', clientUpdates);
  await commitCollection('ptPackageRecords', ptPackageWrites);

  const elapsedSec = ((Date.now() - globalStart) / 1000).toFixed(1);
  console.log('\n================================================================================');
  console.log(` ✅ QUOTA & BENEFIT RECONCILIATION COMPLETE in ${elapsedSec}s (${DATABASE_ID})`);
  console.log('================================================================================');
}

main().catch((err) => {
  console.error('Fatal reconciliation error:', err);
  process.exit(1);
});
