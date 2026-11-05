import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const INZAN_PROJECT_ID = 'faa-test-guide-v2';
const INZAN_DATABASE_ID = 'db-inzanathletics';
const BACKUP_DIR = path.resolve(process.cwd(), 'backups', 'redgits_master_archive_2026');

let inzanApp: App;
const existingApps = getApps();
const existingNamed = existingApps.find(a => a.name === 'inzan-enrich-packages');
if (existingNamed) {
  inzanApp = existingNamed;
} else {
  inzanApp = initializeApp({ projectId: INZAN_PROJECT_ID }, 'inzan-enrich-packages');
}
const inzanDb = getFirestore(inzanApp, INZAN_DATABASE_ID);
inzanDb.settings({ ignoreUndefinedProperties: true });

async function enrichMemberPackages() {
  console.log('1. Loading packagelist_payments.json...');
  const pkgPayments = JSON.parse(
    fs.readFileSync(path.join(BACKUP_DIR, 'packagelist_payments.json'), 'utf8')
  ) as string[][];

  // Map of memberId -> list of packages
  const memberPackagesMap = new Map<string, any[]>();
  const today = new Date().toISOString().slice(0, 10);

  for (let i = 1; i < pkgPayments.length; i++) {
    const row = pkgPayments[i];
    if (!row || row.length < 12) continue;
    const mid = (row[2] || '').trim();
    if (!mid) continue;
    const pkgName = (row[3] || '').trim();
    const type = (row[4] || '').trim();
    const paid = parseFloat((row[5] || '0').replace(/[^\d.]/g, '')) || 0;
    const sn = (row[6] || '').trim();
    const start = (row[10] || '').trim();
    const end = (row[11] || '').trim();
    const sales = (row[12] || '').trim();

    let status = 'Active';
    let isPending = false;
    if (end && end < today) {
      status = 'Expired';
    } else if (start && start > today) {
      status = 'Active';
      isPending = true; // Queued future renewal
    }

    const pkgObj = {
      packageId: `redgits-${sn || `${mid}_${start}`}`,
      packageName: pkgName,
      status,
      startDate: start || undefined,
      endDate: end || undefined,
      paidAmount: paid,
      type: pkgName.toLowerCase().includes('pt') ? 'Private' : 'Group',
      isPendingConfirmation: isPending,
      salesName: sales || undefined,
      serialNumber: sn || undefined,
    };

    if (!memberPackagesMap.has(mid)) memberPackagesMap.set(mid, []);
    memberPackagesMap.get(mid)!.push(pkgObj);
  }

  console.log(`Mapped packages for ${memberPackagesMap.size} distinct member IDs.`);

  // 2. Fetch all clients and update their `packages` array
  console.log('2. Fetching all clients from db-inzanathletics...');
  const clientsSnap = await inzanDb.collection('clients').get();
  console.log(`Fetched ${clientsSnap.size} client documents.`);

  const batchSize = 450;
  let batch = inzanDb.batch();
  let count = 0;
  let totalUpdated = 0;

  for (const doc of clientsSnap.docs) {
    const data = doc.data();
    const mid = String(data.memberId || data.memberCode || data.redgitsId || '').trim();
    const rId = String(data.redgitsId || '').trim();

    const pkgs = memberPackagesMap.get(mid) || memberPackagesMap.get(rId);
    if (pkgs && pkgs.length > 0) {
      // Sort packages so active non-future is first, then future, then expired
      pkgs.sort((a, b) => {
        if (a.status === 'Active' && !a.isPendingConfirmation) return -1;
        if (b.status === 'Active' && !b.isPendingConfirmation) return 1;
        return (b.endDate || '').localeCompare(a.endDate || '');
      });

      const currentActive = pkgs.find(p => p.status === 'Active' && !p.isPendingConfirmation) || pkgs[0];

      batch.update(doc.ref, {
        packages: pkgs,
        packageType: currentActive.packageName,
        membershipStartDate: currentActive.startDate || data.membershipStartDate || null,
        membershipEndDate: currentActive.endDate || data.membershipEndDate || null,
        membershipExpiry: currentActive.endDate || data.membershipExpiry || null,
      });

      count++;
      totalUpdated++;

      if (count >= batchSize) {
        await batch.commit();
        console.log(`  Committed ${totalUpdated} member package enrichments...`);
        batch = inzanDb.batch();
        count = 0;
      }
    }
  }

  if (count > 0) {
    await batch.commit();
    console.log(`  Committed final batch (${totalUpdated} total enriched).`);
  }

  console.log(`✓ Enriched ${totalUpdated} members with complete multi-package history arrays!`);
}

enrichMemberPackages().catch(console.error);
