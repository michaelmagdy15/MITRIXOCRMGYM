import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const INZAN_PROJECT_ID = 'faa-test-guide-v2';
const INZAN_DATABASE_ID = 'db-inzanathletics';
const BACKUP_DIR = path.resolve(process.cwd(), 'backups', 'redgits_master_archive_2026');

let inzanApp: App;
const existingApps = getApps();
const existingNamed = existingApps.find(a => a.name === 'inzan-archive-loader');
if (existingNamed) {
  inzanApp = existingNamed;
} else {
  inzanApp = initializeApp({ projectId: INZAN_PROJECT_ID }, 'inzan-archive-loader');
}
const inzanDb = getFirestore(inzanApp, INZAN_DATABASE_ID);
inzanDb.settings({ ignoreUndefinedProperties: true });

function stripUndefined(obj: any): any {
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj && typeof obj === 'object') {
    const res: any = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] !== undefined) {
        res[key] = stripUndefined(obj[key]);
      }
    }
    return res;
  }
  return obj;
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
          batch.set(docRef, stripUndefined(item.data), { merge: true });
        }
        await batch.commit();
      })
    );
    committed += group.reduce((sum, g) => sum + g.length, 0);
  }
  console.log(`  ✓ Committed ${committed} docs to '${collectionName}'`);
  return committed;
}

function loadJson<T>(filename: string): T {
  const filePath = path.join(BACKUP_DIR, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

async function run() {
  const startTime = Date.now();
  console.log('================================================================================');
  console.log(' LOADING MASTER REDGITS ARCHIVE TO FIRESTORE db-inzanathletics');
  console.log(` Project: ${INZAN_PROJECT_ID} (crm-production)`);
  console.log('================================================================================\n');

  // 1. Packages
  console.log('1. Loading Packages Catalog...');
  const pkgRows = loadJson<string[][]>('packages_catalog.json');
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

  // 2. Staff / Coaches
  console.log('2. Loading Staff & Coaches...');
  const staffRows = loadJson<string[][]>('staff_working_and_past.json');
  const staffMap = new Map<string, { id: string; data: Record<string, any> }>();
  for (const row of staffRows) {
    if (row.length < 3) continue;
    const name = (row[1] || row[0] || '').trim();
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

  // 3. National IDs map
  console.log('3. Building National ID Map...');
  const natRows = loadJson<string[][]>('national_ids_birthdays.json');
  const natMap = new Map<string, { natId: string; dob: string }>();
  for (const row of natRows) {
    if (row.length < 4) continue;
    const cardId = (row[0] || '').trim();
    const natId = (row[2] || '').trim();
    const dob = (row[3] || '').trim();
    if (cardId) natMap.set(cardId, { natId, dob });
  }

  // 4. Active + Expired Members -> clients
  console.log('4. Loading Active & Expired Members...');
  const activeRows = loadJson<any[][]>('active_members.json');
  const expiredRows = loadJson<any[][]>('expired_members.json');
  const memberMap = new Map<string, { id: string; data: Record<string, any> }>();

  for (const row of activeRows) {
    const rId = (row[0] || '').replace(/[^\d]/g, '');
    const name = (row[1] || '').trim();
    if (!rId || !name) continue;
    const cardId = (row[2] || '').trim();
    const pkgName = (row[3] || '').trim();
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

  for (const row of expiredRows) {
    const idMatch = (row[8] || '').match(/view\/(\d+)/i) || (row[2] || '').match(/view_member_mobile\((\d+)\)/i);
    const rId = idMatch?.[1] || '';
    const name = (row[0] || '').trim();
    if (!rId || !name) continue;
    const cardId = (row[1] || '').trim() || rId;
    const pkgName = (row[3] || '').trim();
    const start = (row[4] || '').trim();
    const end = (row[5] || '').trim();
    const sales = (row[6] || '').trim();
    const docId = `redgits-${rId}`;

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
  console.log(`  • Writing ${memberMap.size} members (Active + Expired) to 'clients'...`);
  await commitDocsInBatches('clients', Array.from(memberMap.values()));

  // 5. Payments (Package List)
  console.log('5. Loading Payments & Package Sales...');
  const pkgListRows = loadJson<string[][]>('packagelist_payments.json');
  const payMap = new Map<string, { id: string; data: Record<string, any> }>();
  for (let i = 1; i < pkgListRows.length; i++) {
    const row = pkgListRows[i];
    if (row.length < 6) continue;
    const dateStr = (row[0] || '').trim();
    const name = (row[1] || '').trim();
    const cardId = (row[2] || '').trim();
    const pkgName = (row[3] || '').trim();
    const type = (row[4] || '').trim();
    const paid = parseFloat((row[5] || '0').replace(/[^\d.]/g, '')) || 0;
    const sn = (row[6] || '').trim();
    const phone = (row[8] || '').trim();
    const method = (row[9] || '').trim() || 'Cash';
    const start = (row[10] || '').trim();
    const end = (row[11] || '').trim();
    const sales = (row[12] || '').trim();
    const cashier = (row[13] || '').trim() || 'Front Desk';

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
  console.log(`  • Writing ${payMap.size} payment transactions to 'payments'...`);
  await commitDocsInBatches('payments', Array.from(payMap.values()));

  // 6. Debtors
  console.log('6. Loading Debtors & Unpaid Incomes...');
  const debtorRows = loadJson<string[][]>('debtors_unpaid_incomes.json');
  const debtorMap = new Map<string, { id: string; data: Record<string, any> }>();
  for (let i = 1; i < debtorRows.length; i++) {
    const row = debtorRows[i];
    if (row.length < 12) continue;
    const name = (row[0] || '').trim();
    const dateStr = (row[1] || '').trim();
    const mid = (row[2] || '').trim();
    const mobile = (row[3] || '').trim();
    const sales = (row[4] || '').trim();
    const start = (row[5] || '').trim();
    const end = (row[6] || '').trim();
    const code = (row[7] || '').trim();
    const pkgName = (row[8] || '').trim();
    const paid = parseFloat((row[10] || '0').replace(/[^\d.]/g, '')) || 0;
    const remain = parseFloat((row[11] || '0').replace(/[^\d.]/g, '')) || 0;
    const dId = `redgits-debtor-${code || mid}_${dateStr.slice(0, 10)}`;
    if (remain > 0 || paid > 0) {
      debtorMap.set(dId, {
        id: dId,
        data: {
          id: dId,
          clientName: name,
          memberId: mid,
          phone: mobile || undefined,
          salesName: sales || undefined,
          packageType: pkgName,
          startDate: start || undefined,
          endDate: end || undefined,
          paidAmount: paid,
          remainingAmount: remain,
          status: remain > 0 ? 'Unpaid' : 'Paid',
          branch: 'Garden 8',
          date: dateStr,
          sourceSystem: 'RedGITS_v17.14',
          updatedAt: new Date().toISOString(),
        },
      });
    }
  }
  console.log(`  • Writing ${debtorMap.size} debtor records to 'debtors'...`);
  await commitDocsInBatches('debtors', Array.from(debtorMap.values()));

  // 7. Check-ins across 2026 (Attendance)
  console.log('7. Loading Historical Check-ins (Attendance)...');
  const checkInsRaw = loadJson<string[][]>('historical_checkins_2026.json');
  const attMap = new Map<string, { id: string; data: Record<string, any> }>();
  for (const row of checkInsRaw) {
    if (row.length < 11) continue;
    const dateM = (row[3] || '').match(/\d{4}-\d{2}-\d{2}/);
    const dateStr = dateM?.[0];
    const rId = (row[0] || '').replace(/[^\d]/g, '');
    const memberName = (row[1] || '').trim();
    const cardId = (row[2] || '').trim();
    const timeRaw = (row[4] || '').trim();
    const validT = /^\d{2}:\d{2}(:\d{2})?$/.test(timeRaw) ? (timeRaw.length === 5 ? `${timeRaw}:00` : timeRaw) : '12:00:00';
    if (!rId || !dateStr) continue;

    const timeClean = validT.replace(/:/g, '');
    const attId = `redgits-att-${rId}-${dateStr}_${timeClean}`;
    attMap.set(attId, {
      id: attId,
      data: {
        id: attId,
        clientId: `redgits-${rId}`,
        memberId: cardId || rId,
        memberName,
        branch: 'Garden 8',
        date: `${dateStr}T${validT}`,
        sessionDate: dateStr,
        checkInTime: validT,
        checkOutTime: row[5] || undefined,
        packageName: row[8] || row[6] || 'Basic Membership',
        locker: row[10] || undefined,
        recordedBy: row[12] || 'Front Desk',
        status: 'ATTENDED',
        sourceSystem: 'RedGITS_v17.14',
        updatedAt: new Date().toISOString(),
      },
    });
  }
  console.log(`  • Writing ${attMap.size} historical check-ins to 'attendance'...`);
  await commitDocsInBatches('attendance', Array.from(attMap.values()));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n================================================================================');
  console.log(` ✅ FIRESTORE LOAD COMPLETED IN ${elapsed}s`);
  console.log(` Total Members (Active + Expired) : ${memberMap.size}`);
  console.log(` Total Payments & Package Sales   : ${payMap.size}`);
  console.log(` Total Debtors Tracked            : ${debtorMap.size}`);
  console.log(` Total Packages Catalog           : ${pkgMap.size}`);
  console.log(` Total Staff / Coaches            : ${staffMap.size}`);
  console.log(` Total Check-ins (Attendance)     : ${attMap.size}`);
  console.log('================================================================================\n');
}

run().catch((err) => {
  console.error('Loader failed:', err);
  process.exit(1);
});
