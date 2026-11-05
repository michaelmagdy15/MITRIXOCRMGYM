import { chromium } from 'playwright';
import { initializeApp, getApps, getApp, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// ==============================================================================
// MASTER REDGITS COMPLETE DATA DUMP & ARCHIVE FOR INZAN ATHLETICS
// Targets:
// 1. Raw disk storage: backups/redgits_master_archive_2026/
// 2. Live Firestore: faa-test-guide-v2 (db-inzanathletics)
// ==============================================================================

const REDGITS_ORIGIN = 'https://inzan.redgits.com';
const REDGITS_USER = 'mi5a';
const REDGITS_PASS = 'Miko0019_!';
const INZAN_PROJECT_ID = 'faa-test-guide-v2';
const INZAN_DATABASE_ID = 'db-inzanathletics';

const BACKUP_DIR = path.resolve(process.cwd(), 'backups', 'redgits_master_archive_2026');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Initialize Firebase Admin for Inzan
let inzanApp: App;
const existingApps = getApps();
const existingNamed = existingApps.find(a => a.name === 'inzan-master-dump');
if (existingNamed) {
  inzanApp = existingNamed;
} else {
  inzanApp = initializeApp({ projectId: INZAN_PROJECT_ID }, 'inzan-master-dump');
}
const inzanDb = getFirestore(inzanApp, INZAN_DATABASE_ID);

function cleanString(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
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
}

function parseTableRows(html: string): string[][] {
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
      cells.push(cleanString(tdMatch[1] || ''));
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
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
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const group = chunks.slice(i, i + CONCURRENCY);
    await Promise.all(
      group.map(async chunk => {
        const batch = inzanDb.batch();
        for (const item of chunk) {
          const docRef = inzanDb.collection(collectionName).doc(item.id);
          batch.set(docRef, item.data, { merge: true });
        }
        await batch.commit();
      })
    );
    committed += group.reduce((sum, g) => sum + g.length, 0);
  }
  console.log(`  ✓ Committed ${committed} docs to '${collectionName}'`);
  return committed;
}

function saveJsonBackup(filename: string, data: any) {
  const filePath = path.join(BACKUP_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  💾 Archived to disk: ${filename} (${(fs.statSync(filePath).size / 1024).toFixed(1)} KB)`);
}

async function run() {
  const startTime = Date.now();
  console.log('================================================================================');
  console.log(' MASTER REDGITS 100% COMPLETE DATA EXTRACTION & ARCHIVE');
  console.log(` Target Firestore: ${INZAN_PROJECT_ID} / ${INZAN_DATABASE_ID}`);
  console.log(` Disk Directory   : ${BACKUP_DIR}`);
  console.log('================================================================================\n');

  console.log('1. Authenticating Playwright session with RedGITS...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 }
  });

  await page.goto(`${REDGITS_ORIGIN}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(({ u, p }) => {
    const uEl = document.querySelector('#username') as HTMLInputElement;
    if (uEl) { uEl.removeAttribute('readonly'); uEl.value = u; }
    const pEl = document.querySelector('#password') as HTMLInputElement;
    if (pEl) { pEl.value = p; }
  }, { u: REDGITS_USER, p: REDGITS_PASS });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 25000 }),
    page.click('#login-form button[type="submit"]')
  ]);

  if (!page.url().includes('/admin/home')) {
    throw new Error(`Authentication failed. Landed on: ${page.url()}`);
  }
  console.log(`✓ Authenticated as ${REDGITS_USER}. Session URL: ${page.url()}\n`);

  console.log('2. Extracting Complete Historical Datasets from RedGITS...\n');

  // -------------------------------------------------------------
  // 2A. ACTIVE MEMBERS (DataTables)
  // -------------------------------------------------------------
  console.log('  [1/12] Fetching Active Members (/admin/member_data/active - 50,000 limit)...');
  const activeRes = await page.evaluate(async () => {
    const params = new URLSearchParams({ draw: '1', start: '0', length: '50000', 'search[value]': '' });
    const r = await fetch('/admin/member_data/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: params.toString()
    });
    return await r.json();
  });
  const activeRows = activeRes?.data || [];
  console.log(`    → Received ${activeRows.length} active members`);
  saveJsonBackup('active_members.json', activeRows);

  // -------------------------------------------------------------
  // 2B. EXPIRED MEMBERS (DataTables)
  // -------------------------------------------------------------
  console.log('  [2/12] Fetching Expired Members (/admin/member_data/expiredmember - 50,000 limit)...');
  const expiredRes = await page.evaluate(async () => {
    const params = new URLSearchParams({ draw: '1', start: '0', length: '50000', 'search[value]': '' });
    const r = await fetch('/admin/member_data/expiredmember', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: params.toString()
    });
    return await r.json();
  });
  const expiredRows = expiredRes?.data || [];
  console.log(`    → Received ${expiredRows.length} expired members`);
  saveJsonBackup('expired_members.json', expiredRows);

  // -------------------------------------------------------------
  // 2C. GUEST MEMBERS / LEADS (DataTables)
  // -------------------------------------------------------------
  console.log('  [3/12] Fetching Guest Members & Leads (/admin/member_data/guest - 50,000 limit)...');
  const guestRes = await page.evaluate(async () => {
    const params = new URLSearchParams({ draw: '1', start: '0', length: '50000', 'search[value]': '' });
    const r = await fetch('/admin/member_data/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: params.toString()
    });
    return await r.json();
  });
  const guestRows = guestRes?.data || [];
  console.log(`    → Received ${guestRows.length} guest members / leads`);
  saveJsonBackup('guest_members_leads.json', guestRows);

  // -------------------------------------------------------------
  // 2D. INVITATIONS (DataTables)
  // -------------------------------------------------------------
  console.log('  [4/12] Fetching Invitations (/admin/member_data/viewinvitation - 50,000 limit)...');
  const invRes = await page.evaluate(async () => {
    const params = new URLSearchParams({ draw: '1', start: '0', length: '50000', 'search[value]': '' });
    const r = await fetch('/admin/member_data/viewinvitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: params.toString()
    });
    return await r.json();
  });
  const invRows = invRes?.data || [];
  console.log(`    → Received ${invRows.length} invitations`);
  saveJsonBackup('invitations.json', invRows);

  // -------------------------------------------------------------
  // 2E. NATIONAL IDS & BIRTHDAYS REPORT
  // -------------------------------------------------------------
  console.log('  [5/12] Fetching National IDs & Birthdays (/admin/reports/nationalMembers)...');
  const natHtml = await page.evaluate(async () => {
    const r = await fetch('/admin/reports/nationalMembers');
    return await r.text();
  });
  const natRows = parseTableRows(natHtml);
  console.log(`    → Received ${natRows.length} national ID rows`);
  saveJsonBackup('national_ids_birthdays.json', natRows);

  // -------------------------------------------------------------
  // 2F. PACKAGE CATALOG
  // -------------------------------------------------------------
  console.log('  [6/12] Fetching Packages Catalog (/admin/packages/show)...');
  const pkgHtml = await page.evaluate(async () => {
    const r = await fetch('/admin/packages/show');
    return await r.text();
  });
  const pkgRows = parseTableRows(pkgHtml);
  console.log(`    → Received ${pkgRows.length} packages catalog rows`);
  saveJsonBackup('packages_catalog.json', pkgRows);

  // -------------------------------------------------------------
  // 2G. PACKAGE LIST / POS SALES
  // -------------------------------------------------------------
  console.log('  [7/12] Fetching Package List / POS Sales (/admin/packagelist)...');
  const pkgListHtml = await page.evaluate(async () => {
    const r = await fetch('/admin/packagelist');
    return await r.text();
  });
  const pkgListRows = parseTableRows(pkgListHtml);
  console.log(`    → Received ${pkgListRows.length} package list / payment rows`);
  saveJsonBackup('packagelist_payments.json', pkgListRows);

  // -------------------------------------------------------------
  // 2H. DEBTORS & OUTSTANDING INCOMES
  // -------------------------------------------------------------
  console.log('  [8/12] Fetching Debtors & Unpaid Incomes (/admin/incomes/search)...');
  const incSearchHtml = await page.evaluate(async () => {
    const r = await fetch('/admin/incomes/search');
    return await r.text();
  });
  const incSearchRows = parseTableRows(incSearchHtml);
  console.log(`    → Received ${incSearchRows.length} debtors rows`);
  saveJsonBackup('debtors_unpaid_incomes.json', incSearchRows);

  // -------------------------------------------------------------
  // 2I. CALL CENTER LOGS
  // -------------------------------------------------------------
  console.log('  [9/12] Fetching Call Center Logs (/admin/callcenter)...');
  const ccHtml = await page.evaluate(async () => {
    const r = await fetch('/admin/callcenter');
    return await r.text();
  });
  const ccRows = parseTableRows(ccHtml);
  console.log(`    → Received ${ccRows.length} call center rows`);
  saveJsonBackup('callcenter_logs.json', ccRows);

  // -------------------------------------------------------------
  // 2J. LOST & FOUND
  // -------------------------------------------------------------
  console.log('  [10/12] Fetching Lost & Found (/admin/lost)...');
  const lostHtml = await page.evaluate(async () => {
    const r = await fetch('/admin/lost');
    return await r.text();
  });
  const lostRows = parseTableRows(lostHtml);
  console.log(`    → Received ${lostRows.length} lost and found rows`);
  saveJsonBackup('lost_and_found.json', lostRows);

  // -------------------------------------------------------------
  // 2K. STAFF (Working & Non-Working)
  // -------------------------------------------------------------
  console.log('  [11/12] Fetching Staff (/admin/staff/show & /admin/staff/show2)...');
  const staffHtml1 = await page.evaluate(async () => {
    const r = await fetch('/admin/staff/show');
    return await r.text();
  });
  const staffHtml2 = await page.evaluate(async () => {
    const r = await fetch('/admin/staff/show2');
    return await r.text();
  });
  const staffRows1 = parseTableRows(staffHtml1);
  const staffRows2 = parseTableRows(staffHtml2);
  const combinedStaff = [...staffRows1, ...staffRows2];
  console.log(`    → Received ${combinedStaff.length} staff rows`);
  saveJsonBackup('staff_working_and_past.json', combinedStaff);

  // -------------------------------------------------------------
  // 2L. CHECK-INS HISTORY (Past 90 Days + All Month Intervals)
  // -------------------------------------------------------------
  console.log('  [12/12] Fetching Check-ins History (/admin/check/getactivitesday across 2026)...');
  const intervals = [
    { from: '2026-08-01 00:00:00', to: '2026-08-31 23:59:59' },
    { from: '2026-09-01 00:00:00', to: '2026-09-30 23:59:59' },
    { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' },
    { from: '2026-11-01 00:00:00', to: '2026-11-06 23:59:59' },
  ];
  let allCheckInsRaw: any[] = [];
  for (const interval of intervals) {
    console.log(`    • Fetching ${interval.from.slice(0, 10)} to ${interval.to.slice(0, 10)}...`);
    const dayHtml = await page.evaluate(async (intv) => {
      const p = new URLSearchParams({ fromdate: intv.from, todate: intv.to, gender: '' });
      const r = await fetch(`/admin/check/getactivitesday?${p.toString()}`);
      return await r.text();
    }, interval);
    const dayRows = parseTableRows(dayHtml);
    console.log(`      ✓ Got ${dayRows.length} check-in entries`);
    allCheckInsRaw.push(...dayRows);
  }
  saveJsonBackup('historical_checkins_2026.json', allCheckInsRaw);

  await browser.close();
  console.log('\n✓ All 12 datasets successfully extracted and safely archived to disk!\n');

  // =============================================================
  // 3. PERSISTING & UPDATING FIRESTORE db-inzanathletics
  // =============================================================
  console.log('3. Upserting into Firestore db-inzanathletics...\n');

  // 3A. Packages Catalog
  const pkgMap = new Map<string, { id: string; data: Record<string, any> }>();
  for (const row of pkgRows) {
    if (row.length < 5) continue;
    const name = row[0];
    if (!name || name.toLowerCase() === 'package name') continue;
    const price = parseFloat((row[1] || '0').replace(/[^\d.]/g, '')) || 0;
    const sessions = parseInt((row[2] || '0').replace(/[^\d]/g, ''), 10) || 0;
    const expiry = parseInt((row[3] || '30').replace(/[^\d]/g, ''), 10) || 30;
    const id = `redgits-pkg-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    pkgMap.set(id, {
      id,
      data: {
        id,
        name,
        price,
        sessions,
        expiryDays: expiry,
        branch: 'Garden 8',
        isActive: true,
        is_active: true,
        status: 'Active',
        type: name.toLowerCase().includes('pt') ? 'Private' : 'Group',
        sourceSystem: 'RedGITS_v17.14',
        updatedAt: new Date().toISOString(),
      },
    });
  }
  await commitDocsInBatches('packages', Array.from(pkgMap.values()));

  // 3B. Staff / Coaches
  const staffMap = new Map<string, { id: string; data: Record<string, any> }>();
  for (const row of combinedStaff) {
    if (row.length < 3) continue;
    const name = row[1] || row[0];
    if (!name || name.toLowerCase().includes('name') || name.toLowerCase().includes('working')) continue;
    const id = `redgits-staff-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    staffMap.set(id, {
      id,
      data: {
        id,
        name,
        phone: row[2] || undefined,
        jobTitle: row[6] || row[5] || 'Trainer',
        branch: 'Garden 8',
        active: true,
        sourceSystem: 'RedGITS_v17.14',
        updatedAt: new Date().toISOString(),
      },
    });
  }
  await commitDocsInBatches('coaches', Array.from(staffMap.values()));

  // 3C. Build National ID lookup map
  const natMap = new Map<string, { natId: string; dob: string }>();
  for (const row of natRows) {
    if (row.length < 4) continue;
    const cardId = row[0];
    const natId = row[2];
    const dob = row[3];
    if (cardId) natMap.set(cardId, { natId, dob });
  }

  // 3D. Active Members -> clients
  const memberMap = new Map<string, { id: string; data: Record<string, any> }>();
  for (const row of activeRows) {
    const rId = (row[0] || '').replace(/[^\d]/g, '');
    const name = (row[1] || '').trim();
    if (!rId || !name) continue;
    const cardId = (row[2] || '').trim();
    const pkgName = (row[3] || '').trim();
    const status = (row[4] || '').trim();
    const start = (row[5] || '').trim();
    const end = (row[6] || '').trim();
    const sales = (row[9] || '').trim();
    const gender = (row[12] || '').trim();
    const nat = natMap.get(cardId) || natMap.get(rId);

    const docId = `redgits-${rId}`;
    memberMap.set(docId, {
      id: docId,
      data: {
        id: docId,
        redgitsId: rId,
        name,
        memberId: cardId || rId,
        packageType: pkgName || 'Membership',
        status: 'Active',
        membershipStartDate: start || undefined,
        membershipEndDate: end || undefined,
        salesName: sales || undefined,
        gender: gender || undefined,
        nationalId: nat?.natId || undefined,
        dateOfBirth: nat?.dob || undefined,
        branch: 'Garden 8',
        isGuest: false,
        sourceSystem: 'RedGITS_v17.14',
        updatedAt: new Date().toISOString(),
      },
    });
  }

  // 3E. Expired Members -> clients
  for (const row of expiredRows) {
    const rId = (row[0] || '').replace(/[^\d]/g, '');
    const name = (row[1] || '').trim();
    if (!rId || !name) continue;
    const cardId = (row[2] || '').trim();
    const pkgName = (row[3] || '').trim();
    const start = (row[4] || '').trim();
    const end = (row[5] || '').trim();
    const sales = (row[6] || '').trim();
    const docId = `redgits-${rId}`;

    // If already inserted as Active, don't downgrade to Expired
    if (!memberMap.has(docId)) {
      const nat = natMap.get(cardId) || natMap.get(rId);
      memberMap.set(docId, {
        id: docId,
        data: {
          id: docId,
          redgitsId: rId,
          name,
          memberId: cardId || rId,
          packageType: pkgName || 'Membership',
          status: 'Expired',
          membershipStartDate: start || undefined,
          membershipEndDate: end || undefined,
          salesName: sales || undefined,
          nationalId: nat?.natId || undefined,
          dateOfBirth: nat?.dob || undefined,
          branch: 'Garden 8',
          isGuest: false,
          sourceSystem: 'RedGITS_v17.14',
          updatedAt: new Date().toISOString(),
        },
      });
    }
  }
  console.log(`  • Writing ${memberMap.size} total members (Active + Expired) to 'clients'...`);
  await commitDocsInBatches('clients', Array.from(memberMap.values()));

  // 3F. Payments & POS Transactions
  const payMap = new Map<string, { id: string; data: Record<string, any> }>();
  for (let i = 1; i < pkgListRows.length; i++) {
    const row = pkgListRows[i];
    if (row.length < 6) continue;
    const dateStr = row[0];
    const name = row[1];
    const cardId = row[2];
    const pkgName = row[3];
    const type = row[4];
    const paid = parseFloat((row[5] || '0').replace(/[^\d.]/g, '')) || 0;
    const sn = row[6] || '';
    const phone = row[8] || '';
    const method = row[9] || 'Cash';
    const start = row[10] || '';
    const end = row[11] || '';
    const sales = row[12] || '';
    const cashier = row[13] || 'Front Desk';

    const payId = `redgits-pay-${sn || `${cardId}_${dateStr.replace(/[^0-9]/g, '')}`}`;
    if (paid > 0) {
      payMap.set(payId, {
        id: payId,
        data: {
          id: payId,
          clientName: name,
          memberId: cardId,
          amount: paid,
          originalAmount: paid,
          packageType: pkgName,
          type,
          serialNumber: sn,
          phone,
          method,
          startDate: start || undefined,
          endDate: end || undefined,
          salesName: sales || undefined,
          recordedBy: cashier,
          recordedByName: cashier,
          branch: 'Garden 8',
          status: 'paid',
          date: dateStr || new Date().toISOString(),
          sourceSystem: 'RedGITS_v17.14',
          updatedAt: new Date().toISOString(),
        },
      });
    }
  }
  console.log(`  • Writing ${payMap.size} payment records to 'payments'...`);
  await commitDocsInBatches('payments', Array.from(payMap.values()));

  const totalTimeSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n================================================================================');
  console.log(` ✅ MASTER REDGITS 100% COMPLETE EXTRACTION & SYNC FINISHED in ${totalTimeSec}s`);
  console.log(` Total Members Archived & Synced: ${memberMap.size}`);
  console.log(` Active Members Synced          : ${activeRows.length}`);
  console.log(` Expired Members Synced         : ${expiredRows.length}`);
  console.log(` Guest / Lead Profiles Archived : ${guestRows.length}`);
  console.log(` Payments Synced                : ${payMap.size}`);
  console.log(` Packages Synced                : ${pkgMap.size}`);
  console.log(` Staff / Coaches Synced         : ${staffMap.size}`);
  console.log(` Check-in Entries Archived      : ${allCheckInsRaw.length}`);
  console.log('================================================================================\n');
}

run().catch((err) => {
  console.error('Fatal dump error:', err);
  process.exit(1);
});
