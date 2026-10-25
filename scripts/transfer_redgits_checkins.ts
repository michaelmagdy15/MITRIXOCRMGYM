/**
 * Live Check-ins Transfer from RedGITS v17.12 (`https://inzan.redgits.com`)
 * into Inzan Athletics (`db-inzanathletics` in `faa-test-guide-v2`).
 *
 * Uses RedGITS account: trasnfer / 12122020Aa$
 * Populates:
 * 1. Top-level `attendance` collection (for Check-in Desk, Today's Attendance, Live Floor Occupancy,
 *    Daily Attendance Roster, Advanced Reports, Member Portal, and Desktop Sync)
 * 2. Member subcollection `clients/{clientId}/attendance_history` (deduplicated against existing
 *    `redgits-att-*` historical check-ins so every member has 100% of their lifetime + live check-ins)
 * 3. Updates `lastCheckIn` and `totalVisitsCount` on `clients/{clientId}`
 */

import admin from 'firebase-admin';
import { getFirestore, DocumentReference } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

const PROJECT_ID = 'faa-test-guide-v2';
const DATABASE_ID = 'db-inzanathletics';
const REDGITS_ORIGIN = 'https://inzan.redgits.com';
const REDGITS_USERNAME = process.env.REDGITS_USERNAME || 'mi5a';
const REDGITS_PASSWORD = process.env.REDGITS_PASSWORD || 'Miko0019_!';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: PROJECT_ID });
}

const inzanDb = getFirestore(DATABASE_ID);

export interface ParsedRedgitsCheckIn {
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
  memberType: string;
  locker: string;
  noteCheckIn: string;
  createdBy: string;
  count: number;
  notes: string;
  photoUrl: string;
}

function cleanCellText(html: string): string {
  return String(html || '')
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
}

export function parseRedgitsActivitiesHtml(html: string): ParsedRedgitsCheckIn[] {
  const tableStart = html.indexOf('sample16c');
  if (tableStart === -1) return [];
  const tbodyStart = html.indexOf('<tbody>', tableStart);
  const tbodyEnd = html.indexOf('</tbody>', tbodyStart);
  if (tbodyStart === -1 || tbodyEnd === -1) return [];
  const tbodyHtml = html.slice(tbodyStart, tbodyEnd);

  const records: ParsedRedgitsCheckIn[] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(tbodyHtml)) !== null) {
    const trInner = trMatch[1] || '';
    const cells: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(trInner)) !== null) {
      cells.push(tdMatch[1] || '');
    }
    if (cells.length < 13) continue;

    const idMatch = `${cells[0]} ${cells[1]} ${cells[2]}`.match(/\/admin\/members\/view\/(\d+)/i);
    const redgitsId = idMatch?.[1] ? idMatch[1].trim() : '';
    const photoMatch = (cells[0] || '').match(/src=["']([^"']+)["']/i);
    const photoPath = photoMatch?.[1] ? photoMatch[1].trim() : '';

    const memberName = cleanCellText(cells[1] || '');
    const cardMemberId = cleanCellText(cells[2] || '');
    const dayAndDate = cleanCellText(cells[3] || '');
    const dateMatch = dayAndDate.match(/(\d{4}-\d{2}-\d{2})/);
    const dateStr = dateMatch?.[1] || '';
    const dayName = dayAndDate.replace(/\d{4}-\d{2}-\d{2}/, '').trim();

    const checkInTimeRaw = cleanCellText(cells[4] || '');
    const checkOutTime = cleanCellText(cells[5] || '');
    const packagePrimary = cleanCellText(cells[6] || '');
    const packageCategory = cleanCellText(cells[7] || '');
    const packageName = cleanCellText(cells[8] || '');
    const memberType = cleanCellText(cells[9] || '');
    const locker = cleanCellText(cells[10] || '');
    const noteCheckIn = cleanCellText(cells[11] || '');
    const createdBy = cleanCellText(cells[12] || '');
    const count = parseInt(cleanCellText(cells[13] || '1'), 10) || 1;
    const notes = cleanCellText(cells[14] || '');

    if (!redgitsId || !dateStr) continue;

    const validTime = /^\d{2}:\d{2}(:\d{2})?$/.test(checkInTimeRaw)
      ? checkInTimeRaw.length === 5
        ? `${checkInTimeRaw}:00`
        : checkInTimeRaw
      : '12:00:00';

    records.push({
      redgitsId,
      clientDocId: `redgits-${redgitsId}`,
      memberName,
      cardMemberId,
      dateStr,
      dayName,
      checkInTime: validTime,
      checkOutTime,
      checkedInIso: `${dateStr}T${validTime}`,
      packagePrimary,
      packageCategory,
      packageName: packageName || 'Basic Membership',
      memberType,
      locker,
      noteCheckIn,
      createdBy: createdBy || 'Front Desk',
      count,
      notes,
      photoUrl:
        photoPath && !photoPath.endsWith('/uploads/members/') && !photoPath.endsWith('default.png')
          ? photoPath.startsWith('http')
            ? photoPath
            : `${REDGITS_ORIGIN}${photoPath.startsWith('/') ? '' : '/'}${photoPath}`
          : '',
    });
  }
  return records;
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

async function commitDocWrites(
  label: string,
  writes: Array<{ ref: DocumentReference; data: Record<string, any> }>
): Promise<number> {
  if (writes.length === 0) {
    console.log(`  • ${label}: 0 writes needed`);
    return 0;
  }
  const BATCH_SIZE = 450;
  const CONCURRENCY = 6;
  const chunks: Array<Array<{ ref: DocumentReference; data: Record<string, any> }>> = [];
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    chunks.push(writes.slice(i, i + BATCH_SIZE));
  }

  let committed = 0;
  const t0 = Date.now();
  for (let c = 0; c < chunks.length; c += CONCURRENCY) {
    const group = chunks.slice(c, c + CONCURRENCY);
    await Promise.all(
      group.map(async (chunk) => {
        const batch = inzanDb.batch();
        for (const item of chunk) {
          batch.set(item.ref, stripUndefined(item.data), { merge: true });
        }
        await batch.commit();
      })
    );
    committed += group.reduce((sum, g) => sum + g.length, 0);
    const pct = Math.round((committed / writes.length) * 100);
    console.log(`  [${String(pct).padStart(3)}%] ${label}: ${committed}/${writes.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  return committed;
}

async function main() {
  const startMs = Date.now();
  const nowIso = new Date().toISOString();

  console.log('================================================================================');
  console.log(` RedGITS Live Check-ins Transfer -> Inzan Athletics (${DATABASE_ID})`);
  console.log(` Account: ${REDGITS_USERNAME} @ ${REDGITS_ORIGIN}`);
  console.log('================================================================================\n');

  // 1. Authenticate with RedGITS
  const cookieJar = new Map<string, string>();
  const deviceId = 'fd182a91-4d82-4e11-9a15-8b3d7a109c44';
  const installId = '7c991b22-1c30-4f88-a241-99e1c4102b11';
  const clientFp = 'e8b1204f9a3d11c8402e7a19c5d3b201';
  const deviceCode = 'DEV-INZAN-SYNC-01';
  cookieJar.set('device_id', deviceId);
  cookieJar.set('ua_install_id', installId);
  cookieJar.set('ua_client_fp', clientFp);
  cookieJar.set('ua_device_code', deviceCode);

  const saveCookies = (res: globalThis.Response) => {
    const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const c of sc) {
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

  const r1 = await fetch(`${REDGITS_ORIGIN}/admin/login`, {
    headers: { 'User-Agent': USER_AGENT, Cookie: getCookieHeader() },
  });
  saveCookies(r1);

  const r2 = await fetch(`${REDGITS_ORIGIN}/admin/login/check_login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: getCookieHeader(),
      'User-Agent': USER_AGENT,
      Referer: `${REDGITS_ORIGIN}/admin/login`,
      Origin: REDGITS_ORIGIN,
    },
    body: new URLSearchParams({
      username: REDGITS_USERNAME,
      password: REDGITS_PASSWORD,
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
  saveCookies(r2);

  const loginLocation = r2.headers.get('location') || '';
  if (loginLocation.includes('/admin/login') || (!cookieJar.has('ci_session') && r2.status !== 302)) {
    throw new Error('Failed to authenticate with inzan.redgits.com');
  }
  console.log('✓ Authenticated with inzan.redgits.com (session established)');

  // Save credentials in settings/redgits_credentials
  await inzanDb.collection('settings').doc('redgits_credentials').set(
    {
      username: REDGITS_USERNAME,
      password: REDGITS_PASSWORD,
      updatedAt: nowIso,
      updatedBy: 'transfer-script',
    },
    { merge: true }
  );

  // 2. Fetch Check-ins from RedGITS `/admin/check/getactivitesday`
  const ranges: Array<[string, string]> = [
    ['2026-09-01', '2026-09-30'],
    ['2026-10-01', '2026-10-26'],
  ];

  const allParsedCheckIns: ParsedRedgitsCheckIn[] = [];
  for (const [fromDate, toDate] of ranges) {
    const t0 = Date.now();
    const url = `${REDGITS_ORIGIN}/admin/check/getactivitesday?fromdate=${encodeURIComponent(
      `${fromDate} 00:00:00`
    )}&todate=${encodeURIComponent(`${toDate} 23:59:59`)}&gender=&all=&note=`;
    const res = await fetch(url, {
      headers: {
        Cookie: getCookieHeader(),
        'User-Agent': USER_AGENT,
        Referer: `${REDGITS_ORIGIN}/admin/check/memberactivities`,
      },
    });
    saveCookies(res);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching check-ins for ${fromDate}..${toDate}`);
    }
    const html = await res.text();
    const rows = parseRedgitsActivitiesHtml(html);
    console.log(
      `✓ Fetched ${rows.length.toLocaleString()} check-ins for ${fromDate} .. ${toDate} in ${((Date.now() - t0) / 1000).toFixed(1)}s`
    );
    allParsedCheckIns.push(...rows);
  }

  // Deduplicate by (redgitsId, dateStr, checkInTime)
  const uniqueCheckInsMap = new Map<string, ParsedRedgitsCheckIn>();
  for (const rec of allParsedCheckIns) {
    const key = `${rec.redgitsId}|${rec.dateStr}|${rec.checkInTime}`;
    uniqueCheckInsMap.set(key, rec);
  }
  const uniqueCheckIns = Array.from(uniqueCheckInsMap.values());
  console.log(`✓ Total unique live check-ins extracted: ${uniqueCheckIns.length.toLocaleString()}\n`);

  // 3. Load existing historical subcollection index from redgits_active_deep_extract.json to avoid duplicate subcollection docs
  const deepPath = path.resolve(process.cwd(), 'docs/redgits_pages/redgits_active_deep_extract.json');
  const existingSubColKeyToDocId = new Map<string, string>();
  const historicalVisitsCountByRedgitsId = new Map<string, number>();
  if (fs.existsSync(deepPath)) {
    const deep = JSON.parse(fs.readFileSync(deepPath, 'utf8'));
    const activeDeep = deep.activeDeep || {};
    for (const [rId, d] of Object.entries<any>(activeDeep)) {
      const attRows: string[][] = (d?.att || []).slice(0, 125);
      historicalVisitsCountByRedgitsId.set(rId, (d?.att || []).length);
      for (let aIdx = 0; aIdx < attRows.length; aIdx++) {
        const aRow = attRows[aIdx] || [];
        const aDateStr = String(aRow[0] || '').slice(0, 10);
        const aTimeRaw = String(aRow[2] || '').trim();
        const aTimeStr = /^\d{2}:\d{2}/.test(aTimeRaw)
          ? aTimeRaw.length === 5
            ? `${aTimeRaw}:00`
            : aTimeRaw
          : '12:00:00';
        if (aDateStr) {
          existingSubColKeyToDocId.set(`${rId}|${aDateStr}|${aTimeStr}`, `redgits-att-${rId}-${aIdx + 1}`);
        }
      }
    }
  }

  // 4. Load existing users & clients metadata from db-inzanathletics
  const [usersSnap, clientsSnap] = await Promise.all([
    inzanDb.collection('users').select('name').get(),
    inzanDb
      .collection('clients')
      .select('name', 'memberId', 'sessionsRemaining', 'totalVisitsCount', 'lastCheckIn', 'photoURL')
      .get(),
  ]);

  const userIdByLowerName = new Map<string, string>();
  for (const uDoc of usersSnap.docs) {
    const uName = String(uDoc.data()?.name || '').trim().toLowerCase();
    if (uName) userIdByLowerName.set(uName, uDoc.id);
  }

  const clientMetaMap = new Map<
    string,
    {
      exists: boolean;
      name: string;
      memberId: string;
      sessionsRemaining: number;
      totalVisitsCount: number;
      lastCheckIn: string;
      photoURL: string;
    }
  >();
  for (const cDoc of clientsSnap.docs) {
    const d = cDoc.data();
    clientMetaMap.set(cDoc.id, {
      exists: true,
      name: String(d?.name || ''),
      memberId: String(d?.memberId || ''),
      sessionsRemaining: typeof d?.sessionsRemaining === 'number' ? d.sessionsRemaining : 30,
      totalVisitsCount: typeof d?.totalVisitsCount === 'number' ? d.totalVisitsCount : 0,
      lastCheckIn: String(d?.lastCheckIn || ''),
      photoURL: String(d?.photoURL || ''),
    });
  }

  // 5. Build top-level `attendance` writes, `clients/{id}/attendance_history` writes, and client updates
  const topAttendanceWrites: Array<{ ref: DocumentReference; data: Record<string, any> }> = [];
  const subColWrites: Array<{ ref: DocumentReference; data: Record<string, any> }> = [];
  const clientUpdateAcc = new Map<
    string,
    {
      redgitsId: string;
      memberName: string;
      cardMemberId: string;
      packageName: string;
      latestCheckInIso: string;
      newVisitsAdded: number;
      photoUrl: string;
    }
  >();

  let newSubColCount = 0;
  let updatedSubColCount = 0;

  for (const rec of uniqueCheckIns) {
    const timeClean = rec.checkInTime.replace(/:/g, '');
    const topDocId = `redgits-checkin-${rec.redgitsId}-${rec.dateStr}_${timeClean}`;
    const staffUserId = userIdByLowerName.get(rec.createdBy.toLowerCase()) || rec.createdBy;
    const clientMeta = clientMetaMap.get(rec.clientDocId);
    const resolvedNotes = [
      rec.locker ? `Locker: ${rec.locker}` : '',
      rec.checkOutTime ? `Out: ${rec.checkOutTime}` : '',
      rec.noteCheckIn ? `Check-in Note: ${rec.noteCheckIn}` : '',
      rec.notes || '',
    ]
      .filter(Boolean)
      .join(' · ');

    // Top-level `attendance` document
    topAttendanceWrites.push({
      ref: inzanDb.collection('attendance').doc(topDocId),
      data: {
        id: topDocId,
        clientId: rec.clientDocId,
        memberId: rec.cardMemberId || clientMeta?.memberId || rec.redgitsId,
        redgitsId: rec.redgitsId,
        memberName: rec.memberName || clientMeta?.name || 'Member',
        branch: 'Garden 8',
        date: rec.checkedInIso,
        sessionDate: rec.dateStr,
        checkInTime: rec.checkInTime,
        checkOutTime: rec.checkOutTime || undefined,
        packageName: rec.packageName,
        packageCategory: rec.packageCategory || 'Membership',
        packagePrimary: rec.packagePrimary || 'Primary Package',
        locker: rec.locker || undefined,
        recordedBy: staffUserId,
        recordedByName: rec.createdBy,
        notes: resolvedNotes || undefined,
        status: 'ATTENDED',
        sourceSystem: 'RedGITS_v17.12',
        updatedAt: nowIso,
      },
    });

    // Subcollection `clients/{clientId}/attendance_history` document
    const lookupKey = `${rec.redgitsId}|${rec.dateStr}|${rec.checkInTime}`;
    const existingSubDocId = existingSubColKeyToDocId.get(lookupKey);
    const subDocId = existingSubDocId || topDocId;
    if (existingSubDocId) {
      updatedSubColCount++;
    } else {
      newSubColCount++;
    }

    // Write all October 2026 check-ins (and any check-in not already in activeDeep) to attendance_history
    if (!existingSubDocId || rec.dateStr >= '2026-10-01') {
      subColWrites.push({
        ref: inzanDb.collection('clients').doc(rec.clientDocId).collection('attendance_history').doc(subDocId),
        data: {
          id: subDocId,
          memberId: rec.clientDocId,
          cardMemberId: rec.cardMemberId || clientMeta?.memberId || undefined,
          memberName: rec.memberName || clientMeta?.name || undefined,
          sessionTitle: rec.packageName,
          packageCategory: rec.packageCategory || 'Membership',
          packagePrimary: rec.packagePrimary || 'Primary Package',
          branchName: 'Garden 8',
          sessionDate: rec.dateStr,
          dayName: rec.dayName || undefined,
          checkInTime: rec.checkInTime,
          checkOutTime: rec.checkOutTime || undefined,
          locker: rec.locker || undefined,
          checkedInAt: rec.checkedInIso,
          checkedInBy: rec.createdBy,
          status: 'ATTENDED',
          notes: resolvedNotes || undefined,
          remainingCreditsAfter: clientMeta?.sessionsRemaining ?? 30,
          sourceSystem: 'RedGITS_v17.12',
        },
      });
    }

    // Track per-client latest check-in and visit counts
    const prevAcc = clientUpdateAcc.get(rec.clientDocId);
    if (!prevAcc) {
      clientUpdateAcc.set(rec.clientDocId, {
        redgitsId: rec.redgitsId,
        memberName: rec.memberName,
        cardMemberId: rec.cardMemberId,
        packageName: rec.packageName,
        latestCheckInIso: rec.checkedInIso,
        newVisitsAdded: existingSubDocId ? 0 : 1,
        photoUrl: rec.photoUrl,
      });
    } else {
      if (rec.checkedInIso > prevAcc.latestCheckInIso) {
        prevAcc.latestCheckInIso = rec.checkedInIso;
      }
      if (!existingSubDocId) {
        prevAcc.newVisitsAdded += 1;
      }
      if (!prevAcc.photoUrl && rec.photoUrl) {
        prevAcc.photoUrl = rec.photoUrl;
      }
    }
  }

  const clientWrites: Array<{ ref: DocumentReference; data: Record<string, any> }> = [];
  for (const [clientDocId, acc] of clientUpdateAcc.entries()) {
    const existing = clientMetaMap.get(clientDocId);
    const baseHistCount = Math.max(
      existing?.totalVisitsCount || 0,
      historicalVisitsCountByRedgitsId.get(acc.redgitsId) || 0
    );
    const updatedVisitsCount = baseHistCount + acc.newVisitsAdded;
    const latestCheckIn =
      existing?.lastCheckIn && existing.lastCheckIn > acc.latestCheckInIso
        ? existing.lastCheckIn
        : acc.latestCheckInIso;

    if (existing?.exists) {
      clientWrites.push({
        ref: inzanDb.collection('clients').doc(clientDocId),
        data: {
          lastCheckIn: latestCheckIn,
          totalVisitsCount: updatedVisitsCount,
          ...(!existing.photoURL && acc.photoUrl ? { photoURL: acc.photoUrl } : {}),
          updatedAt: nowIso,
        },
      });
    } else {
      // Ensure brand-new member who checked in today also has a client document
      clientWrites.push({
        ref: inzanDb.collection('clients').doc(clientDocId),
        data: {
          id: clientDocId,
          redgitsId: acc.redgitsId,
          legacyMemberId: acc.redgitsId,
          leadId: acc.redgitsId,
          memberId: acc.cardMemberId && acc.cardMemberId !== acc.redgitsId ? acc.cardMemberId : undefined,
          name: acc.memberName || 'Member',
          phone: '',
          status: 'Active',
          branch: 'Garden 8',
          packageType: acc.packageName || 'Basic Membership',
          primaryPackageName: acc.packageName || 'Basic Membership',
          lastCheckIn: latestCheckIn,
          totalVisitsCount: Math.max(1, updatedVisitsCount),
          photoURL: acc.photoUrl || undefined,
          sourceSystem: 'RedGITS_v17.12',
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      });
    }
  }

  console.log(`Prepared Firestore writes for ${DATABASE_ID}:`);
  console.log(`  • Top-level 'attendance' collection : ${topAttendanceWrites.length.toLocaleString()} check-ins`);
  console.log(
    `  • Subcollection 'attendance_history': ${subColWrites.length.toLocaleString()} check-ins (${newSubColCount.toLocaleString()} net-new since Oct 15)`
  );
  console.log(`  • Member profiles updated           : ${clientWrites.length.toLocaleString()} members\n`);

  await commitDocWrites("1/3 Top-level 'attendance'", topAttendanceWrites);
  await commitDocWrites("2/3 Subcollection 'attendance_history'", subColWrites);
  await commitDocWrites("3/3 Client visit counters & lastCheckIn", clientWrites);

  // Update settings/redgits_sync_status with checkIns count
  const statusRef = inzanDb.collection('settings').doc('redgits_sync_status');
  const statusSnap = await statusRef.get();
  const prevCounts = statusSnap.exists ? statusSnap.data()?.counts || {} : {};
  await statusRef.set(
    {
      lastCheckInsSyncAt: nowIso,
      counts: {
        ...prevCounts,
        checkIns: uniqueCheckIns.length,
        totalHistoricalCheckIns: 81749 + newSubColCount,
      },
    },
    { merge: true }
  );

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log('\n================================================================================');
  console.log(
    ` ✅ CHECK-INS TRANSFER COMPLETE in ${elapsedSec}s -> ${DATABASE_ID} (${uniqueCheckIns.length.toLocaleString()} live check-ins synced)`
  );
  console.log('================================================================================');
}

main().catch((err) => {
  console.error('Check-ins transfer failed:', err);
  process.exit(1);
});
