/**
 * READ-ONLY Diagnostic Tool: Entitlement Integrity Auditor
 * Scans tenant payments and client packages to identify missing or unlinked entitlements.
 * STRICTLY READ-ONLY: Never mutates, deletes, or repairs production records.
 *
 * Usage:
 *   node scripts/audit_entitlement_gaps.cjs [--database=db-inzanathletics]
 */

const admin = require('firebase-admin');
const fs = require('fs');

const args = process.argv.slice(2);
let targetDatabase = 'db-inzanathletics';

for (const arg of args) {
  if (arg.startsWith('--database=')) {
    targetDatabase = arg.split('=')[1];
  }
}

// Initialize Admin SDK if not initialized
if (admin.apps.length === 0) {
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (saPath && fs.existsSync(saPath)) {
    admin.initializeApp({
      credential: admin.credential.cert(require(saPath))
    });
  } else {
    admin.initializeApp();
  }
}

async function auditEntitlementGaps() {
  console.log(`\n===============================================================`);
  console.log(`  ENTITLEMENT INTEGRITY AUDITOR (READ-ONLY)`);
  console.log(`  Target Database: ${targetDatabase}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log(`===============================================================\n`);

  try {
    const { getFirestore } = require('firebase-admin/firestore');
    const db = getFirestore(targetDatabase);

    // 1. Fetch all entitlements
    console.log('[1/3] Reading entitlements collection...');
    const entSnap = await db.collection('entitlements').get();
    const entitlementsByPaymentId = new Map();
    const entitlementsByMemberId = new Map();

    entSnap.forEach((doc) => {
      const data = doc.data();
      if (data.paymentId) {
        entitlementsByPaymentId.set(data.paymentId, doc.id);
      }
      if (data.memberId) {
        if (!entitlementsByMemberId.has(data.memberId)) {
          entitlementsByMemberId.set(data.memberId, []);
        }
        entitlementsByMemberId.get(data.memberId).push({ id: doc.id, ...data });
      }
    });
    console.log(`      Found ${entSnap.size} total entitlement documents.`);

    // 2. Fetch payments and check links
    console.log('\n[2/3] Reading payments collection...');
    const paySnap = await db.collection('payments').get();
    let totalEligiblePayments = 0;
    let linkedPayments = 0;
    const missingEntitlementPayments = [];

    paySnap.forEach((doc) => {
      const pay = doc.data();
      if (pay.deleted_at || pay.status === 'refunded' || pay.status === 'failed') {
        return; // Skip non-active or deleted payments
      }

      // Check if payment was for an entitlement-generating package
      const category = (pay.package_category_type || pay.packageType || '').toLowerCase();
      const isEntitlementEligible =
        category.includes('membership') ||
        category.includes('pt') ||
        category.includes('personal') ||
        category.includes('class') ||
        category.includes('group');

      if (!isEntitlementEligible) return;

      totalEligiblePayments++;

      if (entitlementsByPaymentId.has(doc.id)) {
        linkedPayments++;
      } else {
        // Fallback: check if member has an active entitlement matching product
        const memberEnts = entitlementsByMemberId.get(pay.clientId) || [];
        const hasMatchingEnt = memberEnts.some((e) => e.status === 'active' || e.productId === pay.packageId);
        if (hasMatchingEnt) {
          linkedPayments++;
        } else {
          missingEntitlementPayments.push({
            paymentId: doc.id,
            clientId: pay.clientId,
            clientName: pay.client_name || 'N/A',
            amount: pay.amount,
            amountPaid: pay.amount_paid,
            packageType: pay.packageType,
            date: pay.date || pay.created_at
          });
        }
      }
    });

    // 3. Scan clients for active packages without entitlements
    console.log('\n[3/3] Scanning clients for active packages without entitlements...');
    const clientSnap = await db.collection('clients').get();
    const missingPackageEntitlements = [];

    clientSnap.forEach((doc) => {
      const client = doc.data();
      if (client.isDeleted || client.status === 'Lead') return;

      const packages = Array.isArray(client.packages) ? client.packages : [];
      const memberEnts = entitlementsByMemberId.get(doc.id) || [];

      packages.forEach((pkg) => {
        const pkgStatus = (pkg.status || '').toLowerCase();
        if (pkgStatus === 'expired' || pkgStatus === 'inactive' || pkgStatus === 'cancelled') return;

        const hasEnt = memberEnts.some(
          (e) =>
            e.productId === (pkg.id || pkg.packageId) ||
            e.productName === (pkg.name || pkg.packageName) ||
            (e.type === 'pt' && (pkg.isPT || pkg.type === 'pt'))
        );

        if (!hasEnt) {
          missingPackageEntitlements.push({
            clientId: doc.id,
            clientName: client.name || 'N/A',
            packageId: pkg.id || pkg.packageId || 'unknown',
            packageName: pkg.name || pkg.packageName || 'Unknown Package',
            sessionsRemaining: pkg.sessionsRemaining
          });
        }
      });
    });

    // Report results
    console.log(`\n===============================================================`);
    console.log(`  AUDIT SUMMARY RESULTS`);
    console.log(`===============================================================`);
    console.log(`  Total Eligible Payments Checked:  ${totalEligiblePayments}`);
    console.log(`  Entitlements Verified / Linked:   ${linkedPayments}`);
    console.log(`  Payments Missing Entitlements:    ${missingEntitlementPayments.length}`);
    console.log(`  Active Packages Missing Ents:     ${missingPackageEntitlements.length}`);
    console.log(`---------------------------------------------------------------`);

    if (missingEntitlementPayments.length > 0) {
      console.log(`\n⚠️  PAYMENTS MISSING ENTITLEMENTS (Top 10):`);
      missingEntitlementPayments.slice(0, 10).forEach((item, idx) => {
        console.log(`   ${idx + 1}. Payment ID: ${item.paymentId}`);
        console.log(`      Client: ${item.clientName} (${item.clientId})`);
        console.log(`      Package: ${item.packageType} | Paid: ${item.amountPaid || item.amount} EGP | Date: ${item.date}`);
      });
    } else {
      console.log(`\n✅  All eligible payment records are properly linked to entitlements!`);
    }

    if (missingPackageEntitlements.length > 0) {
      console.log(`\n⚠️  ACTIVE PACKAGES MISSING ENTITLEMENTS (Top 10):`);
      missingPackageEntitlements.slice(0, 10).forEach((item, idx) => {
        console.log(`   ${idx + 1}. Client: ${item.clientName} (${item.clientId})`);
        console.log(`      Package: ${item.packageName} (${item.packageId}) | Sessions Rem: ${item.sessionsRemaining}`);
      });
    } else {
      console.log(`✅  All client active packages are accounted for in entitlements!`);
    }

    console.log(`\n[Audit Complete] No changes were written. Zero database mutations.\n`);
  } catch (err) {
    console.error('Audit failed:', err);
    process.exit(1);
  }
}

auditEntitlementGaps();
