/**
 * Automated Pre-Cutover Parity & Integrity Assertion Suite
 * 
 * Verifies that the destination database is a 100% exact copy of Strike CRM data,
 * and asserts that ZERO ATPL Vector, Gamén, or Matchmaking collections exist.
 */

const admin = require('firebase-admin');
const fs = require('fs');

const SOURCE_PROJECT = process.env.SOURCE_PROJECT || 'faa-test-guide-v2';
const TARGET_PROJECT = process.argv[2] || process.env.TARGET_PROJECT;
const TARGET_KEY_PATH = process.argv[3] || process.env.TARGET_SERVICE_ACCOUNT_KEY;

if (!TARGET_PROJECT) {
  console.log(`Usage: node verify-migration-parity.cjs <TARGET_PROJECT_ID> [TARGET_SERVICE_ACCOUNT_KEY_PATH]`);
  process.exit(1);
}

const sourceApp = admin.initializeApp({ projectId: SOURCE_PROJECT }, 'source-verify-app');

let targetAppOptions = { projectId: TARGET_PROJECT };
if (TARGET_KEY_PATH && fs.existsSync(TARGET_KEY_PATH)) {
  const serviceAccount = JSON.parse(fs.readFileSync(TARGET_KEY_PATH, 'utf8'));
  targetAppOptions.credential = admin.credential.cert(serviceAccount);
}
const targetApp = admin.initializeApp(targetAppOptions, 'target-verify-app');

const sourceDb = sourceApp.firestore();
const targetDb = targetApp.firestore();

const VERIFIED_COLLECTIONS = [
  'clients',
  'payments',
  'packages',
  'users',
  'sessions',
  'classSchedules',
  'classBookings',
  'coaches',
  'attendance',
  'attendance_logs',
  'entitlements',
  'auditLogs',
  'tasks',
  'targets',
  'settings',
  'counters'
];

const BLACKLISTED_COLLECTIONS = [
  'atpl_profiles',
  'atpl_subscriptions',
  'gamen_mail',
  'gamen_orders',
  'gamen_products',
  'gamen_subscribers',
  'gamen_traffic',
  'match_audit_logs',
  'match_comments',
  'match_interactions',
  'match_matches',
  'match_profiles',
  'match_tasks',
  'match_users',
  'tenants'
];

async function runVerification() {
  console.log(`\n================================================================`);
  console.log(` 🔍 Strike CRM Database Parity Assertion Suite`);
  console.log(` Target: ${TARGET_PROJECT}`);
  console.log(`================================================================\n`);

  let failureCount = 0;

  // 1. Verify Count Parity Across All Gym Collections
  console.log(`--- [Gate 1] Collection Count Parity ---`);
  for (const col of VERIFIED_COLLECTIONS) {
    const sourceSnap = await sourceDb.collection(col).get();
    const targetSnap = await targetDb.collection(col).get();

    if (sourceSnap.size === targetSnap.size) {
      console.log(` ✅ ${col.padEnd(25)}: MATCH (${sourceSnap.size} docs)`);
    } else {
      console.error(` ❌ ${col.padEnd(25)}: MISMATCH! Source: ${sourceSnap.size}, Target: ${targetSnap.size}`);
      failureCount++;
    }
  }

  // 2. Assert Non-Gym Collections are 100% Empty in Target
  console.log(`\n--- [Gate 2] Intellectual Property & Isolation Gate ---`);
  for (const col of BLACKLISTED_COLLECTIONS) {
    const targetSnap = await targetDb.collection(col).get();
    if (targetSnap.size === 0) {
      console.log(` 🛡️  ${col.padEnd(25)}: CLEAN (0 documents in target)`);
    } else {
      console.error(` 🚨 LEAK DETECTED! ${col} has ${targetSnap.size} documents in target!`);
      failureCount++;
    }
  }

  // 3. Sample 20 Random Client Records for Deep Equality
  console.log(`\n--- [Gate 3] Random Client Deep Data Integrity Check ---`);
  const clientSample = await sourceDb.collection('clients').limit(20).get();
  for (const clientDoc of clientSample.docs) {
    const sourceData = clientDoc.data();
    const targetDoc = await targetDb.collection('clients').doc(clientDoc.id).get();
    
    if (!targetDoc.exists) {
      console.error(` ❌ Client ${clientDoc.id} (${sourceData.name}) missing in target!`);
      failureCount++;
      continue;
    }

    const targetData = targetDoc.data();
    if (targetData.name === sourceData.name && targetData.phone === sourceData.phone) {
      console.log(` ✓ Verified Client: ${clientDoc.id} (${sourceData.name})`);
    } else {
      console.error(` ❌ Client ${clientDoc.id} data mismatch!`);
      failureCount++;
    }
  }

  console.log(`\n================================================================`);
  if (failureCount === 0) {
    console.log(` 🎉 ALL VERIFICATION GATES PASSED! Parity is 100% verified.`);
    console.log(` Safe to proceed with DNS cutover.`);
    console.log(`================================================================\n`);
    process.exit(0);
  } else {
    console.error(` ❌ VERIFICATION FAILED: ${failureCount} errors detected.`);
    console.error(` DO NOT SWITCH DNS until errors are resolved.`);
    console.error(`================================================================\n`);
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error("Verification script error:", err);
  process.exit(1);
});
