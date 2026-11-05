import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const INZAN_PROJECT_ID = 'faa-test-guide-v2';
const INZAN_DATABASE_ID = 'db-inzanathletics';
const BACKUP_DIR = path.resolve(process.cwd(), 'backups', 'redgits_master_archive_2026');
const PHOTO_DIR = path.resolve(process.cwd(), 'backups', 'member_photos');

let inzanApp: App;
const existingApps = getApps();
const existingNamed = existingApps.find(a => a.name === 'inzan-count-verifier');
if (existingNamed) {
  inzanApp = existingNamed;
} else {
  inzanApp = initializeApp({ projectId: INZAN_PROJECT_ID }, 'inzan-count-verifier');
}
const inzanDb = getFirestore(inzanApp, INZAN_DATABASE_ID);

async function verifyAllCounts() {
  console.log('Querying Firestore collection counts for db-inzanathletics...');
  const [
    clientsCount,
    leadsCount,
    invitationsCount,
    paymentsCount,
    debtorsCount,
    attendanceCount,
    packagesCount,
    coachesCount,
  ] = await Promise.all([
    inzanDb.collection('clients').count().get(),
    inzanDb.collection('leads').count().get(),
    inzanDb.collection('invitations').count().get(),
    inzanDb.collection('payments').count().get(),
    inzanDb.collection('debtors').count().get(),
    inzanDb.collection('attendance').count().get(),
    inzanDb.collection('packages').count().get(),
    inzanDb.collection('coaches').count().get(),
  ]);

  const photosCount = fs.existsSync(PHOTO_DIR) ? fs.readdirSync(PHOTO_DIR).length : 0;
  const monthlyCheckinFiles = fs.existsSync(path.join(BACKUP_DIR, 'monthly_checkins'))
    ? fs.readdirSync(path.join(BACKUP_DIR, 'monthly_checkins'))
    : [];

  let monthlyTotal = 0;
  for (const f of monthlyCheckinFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, 'monthly_checkins', f), 'utf8'));
    monthlyTotal += data.length;
  }

  // Calculate total payments sum and debtor debt sum
  const paySnap = await inzanDb.collection('payments').get();
  let totalPaymentsEGP = 0;
  paySnap.forEach(d => { totalPaymentsEGP += Number(d.data().amount || 0); });

  const debtorSnap = await inzanDb.collection('debtors').get();
  let totalDebtRemainingEGP = 0;
  debtorSnap.forEach(d => { totalDebtRemainingEGP += Number(d.data().remainingAmount || 0); });

  console.log('\n================================================================================');
  console.log(' 📊 AUDIT VERIFICATION REPORT (TENANT: INZAN ATHLETICS)');
  console.log('================================================================================');
  console.log(` Clients (Members)          : ${clientsCount.data().count}`);
  console.log(` Guest Leads                : ${leadsCount.data().count}`);
  console.log(` Invitations                : ${invitationsCount.data().count}`);
  console.log(` Payments Ledger            : ${paymentsCount.data().count} (Sum: EGP ${totalPaymentsEGP.toLocaleString()})`);
  console.log(` Debtors / Unpaid Incomes   : ${debtorsCount.data().count} (Remaining Debt: EGP ${totalDebtRemainingEGP.toLocaleString()})`);
  console.log(` Live Attendance / Check-ins: ${attendanceCount.data().count}`);
  console.log(` Packages Catalog           : ${packagesCount.data().count}`);
  console.log(` Coaches / Staff            : ${coachesCount.data().count}`);
  console.log(` Binary Profile Photos (.jpg): ${photosCount}`);
  console.log(` Disk Monthly Check-ins     : ${monthlyTotal} records in ${monthlyCheckinFiles.length} monthly archives`);
  console.log('================================================================================\n');
}

verifyAllCounts().catch(console.error);
