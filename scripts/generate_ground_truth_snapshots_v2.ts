import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const INZAN_PROJECT_ID = 'faa-test-guide-v2';
const INZAN_DATABASE_ID = 'db-inzanathletics';
const GROUND_TRUTH_DIR = path.resolve(process.cwd(), 'backups', 'redgits_ground_truth_2026_11_05');
if (!fs.existsSync(GROUND_TRUTH_DIR)) {
  fs.mkdirSync(GROUND_TRUTH_DIR, { recursive: true });
}

let inzanApp: App;
const existingApps = getApps();
const existingNamed = existingApps.find(a => a.name === 'inzan-gt-2026');
if (existingNamed) {
  inzanApp = existingNamed;
} else {
  inzanApp = initializeApp({ projectId: INZAN_PROJECT_ID }, 'inzan-gt-2026');
}
const inzanDb = getFirestore(inzanApp, INZAN_DATABASE_ID);

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

async function generateGroundTruthSnapshots() {
  console.log('Generating Ground Truth Snapshots in backups/redgits_ground_truth_2026_11_05/...');

  // 1. Debtors map
  const debtorSnap = await inzanDb.collection('debtors').get();
  const debtMapByMemberId: Record<string, any> = {};
  const debtorRows = [
    ['MemberID', 'ClientName', 'Phone', 'Package', 'TotalPrice', 'PaidAmount', 'RemainingDebtEGP', 'DueDate', 'SalesName'].join(',')
  ];
  debtorSnap.forEach(doc => {
    const d = doc.data();
    const mid = String(d.memberId || '').trim();
    if (mid) debtMapByMemberId[mid] = d;
    debtorRows.push([
      escapeCsv(d.memberId || ''),
      escapeCsv(d.clientName || ''),
      escapeCsv(d.phone || ''),
      escapeCsv(d.packageType || ''),
      escapeCsv((Number(d.paidAmount || 0) + Number(d.remainingAmount || 0))),
      escapeCsv(d.paidAmount || 0),
      escapeCsv(d.remainingAmount || 0),
      escapeCsv(d.endDate || d.startDate || ''),
      escapeCsv(d.salesName || ''),
    ].join(','));
  });
  fs.writeFileSync(path.join(GROUND_TRUTH_DIR, 'open_installments_debtors.csv'), debtorRows.join('\n'), 'utf8');
  console.log(`✓ Saved ${debtorRows.length - 1} records to open_installments_debtors.csv`);

  // 2. Active & Frozen members summary
  const clientSnap = await inzanDb.collection('clients').get();
  const memberRows = [
    ['Name', 'Phone', 'Barcode', 'Package', 'StartDate', 'EndDate', 'FreezeDaysLeft', 'InvitationsLeft', 'DebtAmountEGP'].join(',')
  ];
  const ptRows = [
    ['MemberName', 'MemberCode', 'Coach', 'Package', 'TotalSessions', 'UsedSessions', 'RemainingSessions', 'ExpiryDate'].join(',')
  ];

  clientSnap.forEach(doc => {
    const m = doc.data();
    if (m.status === 'Active' || m.status === 'Frozen') {
      const mid = String(m.memberId || m.memberCode || '').trim();
      const debt = debtMapByMemberId[mid]?.remainingAmount || 0;
      memberRows.push([
        escapeCsv(m.name || ''),
        escapeCsv(m.phone || ''),
        escapeCsv(m.memberCode || m.memberId || ''),
        escapeCsv(m.packageType || ''),
        escapeCsv(m.membershipStartDate || ''),
        escapeCsv(m.membershipEndDate || ''),
        escapeCsv(m.remainingFreezeDays || (m.status === 'Frozen' ? 30 : 0)),
        escapeCsv(m.invitationsRemaining || 0),
        escapeCsv(debt),
      ].join(','));
    }

    // Check if member has PT package
    const pkgs = m.packages || [];
    for (const p of pkgs) {
      if ((p.packageName && p.packageName.toLowerCase().includes('pt')) || p.type === 'Private') {
        const total = p.sessions || 8;
        const used = p.usedSessions || 0;
        const remaining = Math.max(0, total - used);
        ptRows.push([
          escapeCsv(m.name || ''),
          escapeCsv(m.memberCode || m.memberId || ''),
          escapeCsv(p.coachName || m.coachName || 'Assigned Coach'),
          escapeCsv(p.packageName || 'Personal Training'),
          escapeCsv(total),
          escapeCsv(used),
          escapeCsv(remaining),
          escapeCsv(p.endDate || m.membershipEndDate || ''),
        ].join(','));
      }
    }
  });

  fs.writeFileSync(path.join(GROUND_TRUTH_DIR, 'active_and_frozen_members_summary.csv'), memberRows.join('\n'), 'utf8');
  console.log(`✓ Saved ${memberRows.length - 1} records to active_and_frozen_members_summary.csv`);

  fs.writeFileSync(path.join(GROUND_TRUTH_DIR, 'pt_balances_summary.csv'), ptRows.join('\n'), 'utf8');
  console.log(`✓ Saved ${ptRows.length - 1} records to pt_balances_summary.csv`);

  console.log('✓ All 3 Ground Truth CSVs successfully written to backups/redgits_ground_truth_2026_11_05/');
}

generateGroundTruthSnapshots().catch(console.error);
