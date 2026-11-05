/**
 * Live Full Sync from RedGITS into Inzan Athletics (`db-inzanathletics` in `faa-test-guide-v2`)
 * Strictly isolated to `faa-test-guide-v2` / `db-inzanathletics`.
 */

import admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const INZAN_DATABASE_ID = 'db-inzanathletics';
const REDGITS_ORIGIN = 'https://inzan.redgits.com';
const REDGITS_USER = 'mi5a';
const REDGITS_PASS = 'Miko0019_!';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: 'faa-test-guide-v2' });
}

const inzanDb = getFirestore(INZAN_DATABASE_ID);

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

function cleanMemberId(raw?: string, rId?: string): string {
  if (!raw) return '';
  const s = String(raw).replace(/\[ID:\d+\]/g, '').trim();
  if (!s || s === '0' || s === '-' || s.toLowerCase() === 'null' || s.toLowerCase() === 'none') return '';
  if (/^code\s*\(/i.test(s)) return '';
  if (rId && s === String(rId).trim() && Number(rId) >= 10000) return '';
  const prefixMatch = s.match(/^([qcpo])\s*-?\s*(\d+)$/i);
  if (prefixMatch && prefixMatch[1] && prefixMatch[2]) {
    return `${prefixMatch[1].toUpperCase()}${prefixMatch[2]}`;
  }
  return s;
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
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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

function stripHtmlAndExtractId(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  const str = String(cell);
  const viewIdMatch = str.match(/\/admin\/members\/view\/(\d+)/i);
  const internalId = viewIdMatch?.[1] ? ` [ID:${viewIdMatch[1]}]` : '';
  const cleaned = str
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#039;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return internalId && !cleaned.includes(internalId) ? `${cleaned}${internalId}` : cleaned;
}

function parseHtmlTableRows(html: string): string[][] {
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch || !tableMatch[1]) return [];
  const rows: string[][] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(tableMatch[1])) !== null) {
    const trInner = trMatch[1] || '';
    const cells: string[] = [];
    const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(trInner)) !== null) {
      cells.push(stripHtmlAndExtractId(tdMatch[1] || ''));
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function stripUndefinedDeep<T>(val: T): T {
  if (Array.isArray(val)) return val.map(stripUndefinedDeep) as unknown as T;
  if (val !== null && typeof val === 'object' && Object.prototype.toString.call(val) === '[object Object]') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(val as Record<string, any>)) {
      if (v !== undefined) cleaned[k] = stripUndefinedDeep(v);
    }
    return cleaned as T;
  }
  return val;
}

async function commitDocsInBatches(
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
  let committed = 0;
  for (let c = 0; c < chunks.length; c += CONCURRENCY) {
    const group = chunks.slice(c, c + CONCURRENCY);
    await Promise.all(
      group.map(async (chunk) => {
        const batch = inzanDb.batch();
        for (const item of chunk) {
          const ref = inzanDb.collection(collectionName).doc(item.id);
          batch.set(ref, stripUndefinedDeep(item.data), { merge: true });
        }
        await batch.commit();
      })
    );
    committed += group.reduce((sum, g) => sum + g.length, 0);
  }
  console.log(`  ✓ Committed ${committed} docs to '${collectionName}'`);
  return committed;
}

async function run() {
  const startTimeMs = Date.now();
  const startedAt = new Date().toISOString();
  console.log('================================================================================');
  console.log(` RedGITS Live Complete Sync -> Inzan Athletics (${INZAN_DATABASE_ID})`);
  console.log(` Timestamp: ${startedAt}`);
  console.log('================================================================================\n');

  // Step 1: Launch Playwright browser to establish authenticated session
  console.log('1. Launching browser to authenticate with RedGITS...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  await page.goto(`${REDGITS_ORIGIN}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(({ u, p }) => {
    const userEl = document.querySelector('#username') as HTMLInputElement;
    if (userEl) { userEl.removeAttribute('readonly'); userEl.value = u; }
    const passEl = document.querySelector('#password') as HTMLInputElement;
    if (passEl) { passEl.value = p; }
  }, { u: REDGITS_USER, p: REDGITS_PASS });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 25000 }).catch(e => console.log('Nav:', e.message)),
    page.click('#login-form button[type="submit"]')
  ]);

  if (!page.url().includes('/admin/home')) {
    throw new Error(`Authentication failed. Current URL: ${page.url()}`);
  }
  console.log(`✓ Authenticated as ${REDGITS_USER}. Session URL: ${page.url()}\n`);

  // Step 2: Fetch datasets via page context
  console.log('2. Fetching datasets from RedGITS...');

  // 2a. Package catalog
  console.log('  • Fetching Package Catalog (/admin/packages/show)...');
  const pkgCatalogHtml = await page.evaluate(async () => {
    const r = await fetch('/admin/packages/show');
    return await r.text();
  });
  const pkgCatalogRows = parseHtmlTableRows(pkgCatalogHtml);
  console.log(`    ✓ Packages catalog: ${pkgCatalogRows.length} rows`);

  // 2b. Active members
  console.log('  • Fetching Active Members (/admin/member_data/active - 50,000)...');
  const activeMembersData = await page.evaluate(async () => {
    const params = new URLSearchParams({
      draw: '1', start: '0', length: '50000',
      'search[value]': '', 'order[0][column]': '0', 'order[0][dir]': 'desc'
    });
    const r = await fetch('/admin/member_data/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: params.toString()
    });
    return await r.json();
  });
  const activeRows: string[][] = (activeMembersData?.data || []).map((row: unknown[]) =>
    Array.isArray(row) ? row.map(cell => stripHtmlAndExtractId(cell)) : []
  );
  console.log(`    ✓ Active members: ${activeRows.length} rows`);

  // 2c. Package list (unconfirmed memberships / payments)
  console.log('  • Fetching Package List / Unconfirmed Memberships (/admin/packagelist)...');
  const pkgListHtml = await page.evaluate(async () => {
    const r = await fetch('/admin/packagelist');
    return await r.text();
  });
  const pkgListRows = parseHtmlTableRows(pkgListHtml);
  console.log(`    ✓ Package list / payments: ${pkgListRows.length} rows`);

  // 2d. National IDs & Birthdays
  console.log('  • Fetching National IDs & Birthdays (/admin/reports/nationalMembers)...');
  const natHtml = await page.evaluate(async () => {
    const r = await fetch('/admin/reports/nationalMembers');
    return await r.text();
  });
  const natRows = parseHtmlTableRows(natHtml);
  console.log(`    ✓ National IDs report: ${natRows.length} rows`);

  // 2e. Guest members
  console.log('  • Fetching Guest Members (/admin/member_data/guest - 25,000)...');
  const guestMembersData = await page.evaluate(async () => {
    const params = new URLSearchParams({
      draw: '1', start: '0', length: '25000',
      'search[value]': '', 'order[0][column]': '0', 'order[0][dir]': 'desc'
    });
    const r = await fetch('/admin/member_data/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: params.toString()
    });
    return await r.json();
  });
  const guestRows: string[][] = (guestMembersData?.data || []).map((row: unknown[]) =>
    Array.isArray(row) ? row.map(cell => stripHtmlAndExtractId(cell)) : []
  );
  console.log(`    ✓ Guest members: ${guestRows.length} rows`);

  // 2f. Invitations
  console.log('  • Fetching Invitations (/admin/member_data/viewinvitation - 1,000)...');
  const invData = await page.evaluate(async () => {
    const params = new URLSearchParams({
      draw: '1', start: '0', length: '1000',
      'search[value]': '', 'order[0][column]': '0', 'order[0][dir]': 'desc'
    });
    const r = await fetch('/admin/member_data/viewinvitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: params.toString()
    });
    return await r.json();
  });
  const invRows: string[][] = (invData?.data || []).map((row: unknown[]) =>
    Array.isArray(row) ? row.map(cell => stripHtmlAndExtractId(cell)) : []
  );
  console.log(`    ✓ Invitations: ${invRows.length} rows`);

  // 2g. Staff
  console.log('  • Fetching Staff (/admin/staff/show)...');
  const staffHtml = await page.evaluate(async () => {
    const r = await fetch('/admin/staff/show');
    return await r.text();
  });
  const staffRows = parseHtmlTableRows(staffHtml);
  console.log(`    ✓ Staff: ${staffRows.length} rows`);

  // 2h. Check-ins (from 2026-10-01 to 2026-11-06)
  console.log('  • Fetching Check-ins (/admin/check/getactivitesday 2026-10-01..2026-11-06)...');
  const actHtml = await page.evaluate(async () => {
    const r = await fetch('/admin/check/getactivitesday?fromdate=2026-10-01%2000:00:00&todate=2026-11-06%2023:59:59&gender=&all=&note=');
    return await r.text();
  });
  
  await browser.close();

  // Parse check-ins
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
  console.log(`    ✓ Live Check-in records parsed: ${liveCheckInRecords.length} check-ins\n`);

  // Step 3: Process & write datasets to Firestore db-inzanathletics
  console.log('3. Processing & Writing to Firestore db-inzanathletics...');

  // 3a. Staff -> coaches & users
  const coachDocsMap = new Map<string, { id: string; data: Record<string, any> }>();
  const userDocsMap = new Map<string, { id: string; data: Record<string, any> }>();
  for (const row of staffRows) {
    if (row.length < 3) continue;
    const name = cleanSalesRepName(row[0]);
    if (!name || name.toLowerCase() === 'name') continue;
    const idMatch = (row[0] || '').match(/\[ID:(\d+)\]/i);
    const redgitsStaffId = idMatch?.[1] || '';
    const phone = normalizePhone(row[1]);
    const jobTitle = row[2] || 'Trainer';
    const email = `${slugifyName(name)}@inzan.com`;
    const docId = redgitsStaffId ? `redgits-staff-${redgitsStaffId}` : `coach-${slugifyName(name)}`;
    coachDocsMap.set(docId, {
      id: docId,
      data: {
        id: docId,
        name,
        email,
        phone,
        active: true,
        jobTitle,
        department: jobTitle.toLowerCase().includes('sales') ? 'Sales' : 'Fitness',
        branch: 'Garden 8',
        redgitsStaffId: redgitsStaffId || undefined,
        updatedAt: new Date().toISOString(),
      },
    });
  }
  await commitDocsInBatches('coaches', Array.from(coachDocsMap.values()));

  // 3b. Packages Catalog
  const packageDocsMap = new Map<string, { id: string; data: Record<string, any> }>();
  for (const row of pkgCatalogRows) {
    if (row.length < 5) continue;
    const name = (row[0] || '').trim();
    if (!name || name.toLowerCase() === 'package name') continue;
    const price = parseFloat((row[1] || '0').replace(/[^\d.]/g, '')) || 0;
    const sessions = parseInt((row[2] || '0').replace(/[^\d]/g, ''), 10) || 0;
    const expiryDays = parseInt((row[3] || '30').replace(/[^\d]/g, ''), 10) || 30;
    const docId = `redgits-pkg-${slugifyName(name)}`;
    packageDocsMap.set(docId, {
      id: docId,
      data: {
        id: docId,
        name,
        price,
        sessions,
        expiryDays,
        branch: 'Garden 8',
        isActive: true,
        is_active: true,
        status: 'Active',
        type: name.toLowerCase().includes('pt') ? 'Private' : 'Group',
        updatedAt: new Date().toISOString(),
      },
    });
  }
  await commitDocsInBatches('packages', Array.from(packageDocsMap.values()));

  // 3c. Build National ID / Birthday lookup map
  const natIdByMemberCode = new Map<string, { nationalId: string; dob: string }>();
  for (const row of natRows) {
    if (row.length < 4) continue;
    const mCode = cleanMemberId(row[0]);
    const natId = (row[2] || '').trim();
    const dob = row[3] || deriveDobFromNationalId(natId);
    if (mCode && (natId || dob)) {
      natIdByMemberCode.set(mCode, { nationalId: natId, dob });
    }
  }

  // 3d. Active members -> clients
  const clientDocsMap = new Map<string, { id: string; data: Record<string, any> }>();
  for (const row of activeRows) {
    if (row.length < 5) continue;
    const viewMatch = (row[13] || row[7] || '').match(/\/admin\/members\/view\/(\d+)/i) ||
                      (row[13] || row[7] || '').match(/\[ID:(\d+)\]/i);
    const rId = viewMatch?.[1] || (row[0] || '').replace(/[^\d]/g, '');
    if (!rId) continue;
    const clientDocId = `redgits-${rId}`;
    const name = (row[1] || '').trim();
    const cardId = cleanMemberId(row[2], rId);
    const packageName = (row[3] || '').trim();
    const status = (row[4] || '').trim();
    const startDate = (row[5] || '').trim();
    const endDate = (row[6] || '').trim();
    const salesMan = cleanSalesRepName(row[9] || '');
    const gender = (row[12] || '').trim();
    const natMeta = natIdByMemberCode.get(cardId) || natIdByMemberCode.get(rId);

    clientDocsMap.set(clientDocId, {
      id: clientDocId,
      data: {
        id: clientDocId,
        redgitsId: rId,
        name: name || 'Member',
        memberId: cardId || rId,
        gender: gender || undefined,
        packageType: packageName || 'Membership',
        status: status.toLowerCase().includes('active') ? 'Active' : 'Expired',
        salesName: salesMan || undefined,
        branch: 'Garden 8',
        nationalId: natMeta?.nationalId || undefined,
        dateOfBirth: natMeta?.dob || undefined,
        membershipStartDate: startDate || undefined,
        membershipEndDate: endDate || undefined,
        isGuest: false,
        sourceSystem: 'RedGITS_v17.14',
        updatedAt: new Date().toISOString(),
      },
    });
  }
  await commitDocsInBatches('clients', Array.from(clientDocsMap.values()));

  // 3e. Check-ins -> top-level `attendance` & subcollection `clients/{id}/attendance_history`
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
    ].filter(Boolean).join(' · ');

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
        sourceSystem: 'RedGITS_v17.14',
        updatedAt: new Date().toISOString(),
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
        sourceSystem: 'RedGITS_v17.14',
      },
    });
  }

  await commitDocsInBatches('attendance', Array.from(attendanceDocsMap.values()));

  // Commit subcollection attendance records
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
    console.log(`  ✓ Committed ${subColAttWrites.length} attendance records to member subcollections`);
  }

  // 3f. Package list -> payments
  const paymentDocsMap = new Map<string, { id: string; data: Record<string, any> }>();
  for (const row of pkgListRows) {
    if (row.length < 6) continue;
    const dateStr = (row[0] || '').trim();
    if (!dateStr || dateStr.toLowerCase() === 'date') continue;

    // Member name & ID is in row[1]
    const rawMemberCell = row[1] || '';
    const idMatch = rawMemberCell.match(/\[ID:(\d+)\]/i) || rawMemberCell.match(/view\/(\d+)/i);
    const rId = idMatch?.[1] || '';
    const name = rawMemberCell.replace(/\[ID:\d+\]/gi, '').trim();
    const memberCardId = (row[2] || '').trim();
    const packageName = (row[3] || '').trim();
    const type = (row[4] || '').trim();
    const paidAmount = parseFloat((row[5] || '0').replace(/[^\d.]/g, '')) || 0;
    const sn = (row[6] || '').trim();
    const mobile = normalizePhone(row[8] || '');
    const method = (row[9] || '').trim() || 'Cash';
    const startDate = (row[10] || '').trim();
    const endDate = (row[11] || '').trim();
    const salesRep = cleanSalesRepName(row[12] || '');
    const createdBy = (row[13] || '').trim() || 'Front Desk';

    const payDocId = `redgits-fin-${rId || slugifyName(name)}-${sn || dateStr.replace(/[^0-9]/g, '')}`;

    if (paidAmount > 0) {
      paymentDocsMap.set(payDocId, {
        id: payDocId,
        data: {
          id: payDocId,
          clientId: rId ? `redgits-${rId}` : undefined,
          clientName: name || 'Member',
          memberId: memberCardId || rId || undefined,
          amount: paidAmount,
          originalAmount: paidAmount,
          packageType: packageName,
          type: type || undefined,
          serialNumber: sn || undefined,
          phone: mobile || undefined,
          method,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          salesName: salesRep || undefined,
          recordedBy: createdBy,
          recordedByName: createdBy,
          branch: 'Garden 8',
          status: 'paid',
          date: dateStr || startDate || new Date().toISOString(),
          sourceSystem: 'RedGITS_v17.14',
          updatedAt: new Date().toISOString(),
        },
      });
    }
  }
  await commitDocsInBatches('payments', Array.from(paymentDocsMap.values()));

  // 3g. Update settings/redgits_sync_status
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startTimeMs;
  await inzanDb.collection('settings').doc('redgits_sync_status').set({
    lastSyncAt: completedAt,
    completedAt,
    syncedAt: completedAt,
    startedAt,
    durationMs,
    syncedBy: 'Live Migration Script',
    status: 'completed',
    redgitsAccountUsed: REDGITS_USER,
    counts: {
      activeMembers: clientDocsMap.size,
      packages: packageDocsMap.size,
      payments: paymentDocsMap.size,
      staff: coachDocsMap.size,
      checkIns: attendanceDocsMap.size,
      invitations: invRows.length,
      guestMembers: guestRows.length,
    },
  }, { merge: true });

  console.log('\n================================================================================');
  console.log(` ✅ INZAN ATHLETICS REDGITS COMPLETE SYNC FINISHED in ${(durationMs / 1000).toFixed(1)}s`);
  console.log(` Active Members Synced: ${clientDocsMap.size}`);
  console.log(` Packages Synced       : ${packageDocsMap.size}`);
  console.log(` Payments Synced       : ${paymentDocsMap.size}`);
  console.log(` Check-ins Synced      : ${attendanceDocsMap.size}`);
  console.log('================================================================================\n');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
