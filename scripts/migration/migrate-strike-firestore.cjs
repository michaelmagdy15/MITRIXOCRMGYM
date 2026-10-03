/**
 * Strike CRM -> Dedicated GCP Firestore Migration Engine
 * 
 * Features:
 * - Scoped exclusively to Strike gym collections (strictly excludes ATPL, Gamén, and Matchmaking)
 * - 400-item atomic batch chunking (respecting Firestore 500-write limit)
 * - Exponential backoff retry logic (up to 3 retries)
 * - Preserves document IDs, timestamps, and nested objects
 * - Detailed progress indicators and summary report
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Allow passing source and target credentials/projects
const SOURCE_PROJECT = process.env.SOURCE_PROJECT || 'faa-test-guide-v2';
const TARGET_PROJECT = process.argv[2] || process.env.TARGET_PROJECT;
const TARGET_KEY_PATH = process.argv[3] || process.env.TARGET_SERVICE_ACCOUNT_KEY;

if (!TARGET_PROJECT) {
  console.log(`
Usage: node migrate-strike-firestore.cjs <TARGET_PROJECT_ID> [TARGET_SERVICE_ACCOUNT_KEY_PATH]
Example: node migrate-strike-firestore.cjs strike-gym-prod ./strike-sa-key.json
  `);
  process.exit(1);
}

console.log(`================================================================`);
console.log(` Strike CRM Firestore Migration Engine`);
console.log(` Source:      ${SOURCE_PROJECT} ((default))`);
console.log(` Destination: ${TARGET_PROJECT} ((default))`);
console.log(`================================================================\n`);

// Initialize Source App (Central faa-test-guide-v2)
const sourceApp = admin.initializeApp({
  projectId: SOURCE_PROJECT
}, 'source-migration-app');

// Initialize Target App (Strike Dedicated)
let targetAppOptions = { projectId: TARGET_PROJECT };
if (TARGET_KEY_PATH && fs.existsSync(TARGET_KEY_PATH)) {
  const serviceAccount = JSON.parse(fs.readFileSync(TARGET_KEY_PATH, 'utf8'));
  targetAppOptions.credential = admin.credential.cert(serviceAccount);
}

const targetApp = admin.initializeApp(targetAppOptions, 'target-migration-app');

const sourceDb = sourceApp.firestore();
const targetDb = targetApp.firestore();

// Whitelist of collections belonging strictly to Strike Gym CRM
const STRIKE_COLLECTIONS = [
  'settings',
  'counters',
  'packages',
  'clients',
  'payments',
  'users',
  'sessions',
  'classSchedules',
  'classBookings',
  'classes',
  'coaches',
  'attendance',
  'attendance_logs',
  'entitlements',
  'auditLogs',
  'tasks',
  'targets',
  'userTargets',
  'permission_templates',
  'pointsBundles',
  'pointsTransactions',
  'pointsWallets',
  'rewards',
  'streaks',
  'systemNotifications',
  'bookingRequests',
  'calendarEvents',
  'badgeDefinitions',
  'memberBadges',
  'vbt_camp',
  'vbt_camp_announcements',
  'vbt_push_tokens'
];

const BATCH_SIZE = 400; // Safe threshold under Firestore 500 limit

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function commitBatchWithRetry(batch, retryCount = 0) {
  try {
    await batch.commit();
  } catch (err) {
    if (retryCount < 3) {
      const waitTime = Math.pow(2, retryCount) * 1000;
      console.warn(`⚠️ Batch commit failed. Retrying in ${waitTime}ms (Attempt ${retryCount + 1}/3)... Error: ${err.message}`);
      await sleep(waitTime);
      return commitBatchWithRetry(batch, retryCount + 1);
    }
    throw err;
  }
}

async function migrateCollection(collectionName) {
  console.log(`\n📦 Migrating collection: '${collectionName}'...`);
  const snapshot = await sourceDb.collection(collectionName).get();
  const total = snapshot.size;
  console.log(`   Found ${total} documents in source.`);

  if (total === 0) {
    return { name: collectionName, total: 0, migrated: 0 };
  }

  let batch = targetDb.batch();
  let countInBatch = 0;
  let totalMigrated = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const docRef = targetDb.collection(collectionName).doc(doc.id);
    batch.set(docRef, data);
    countInBatch++;
    totalMigrated++;

    if (countInBatch >= BATCH_SIZE) {
      await commitBatchWithRetry(batch);
      process.stdout.write(`   ✓ Progress: ${totalMigrated}/${total} (${Math.round((totalMigrated / total) * 100)}%)\r`);
      batch = targetDb.batch();
      countInBatch = 0;
    }
  }

  if (countInBatch > 0) {
    await commitBatchWithRetry(batch);
  }

  console.log(`   ✅ Finished '${collectionName}': ${totalMigrated}/${total} documents migrated.`);
  return { name: collectionName, total, migrated: totalMigrated };
}

async function run() {
  const startTime = Date.now();
  const report = [];

  for (const colName of STRIKE_COLLECTIONS) {
    try {
      const res = await migrateCollection(colName);
      report.push(res);
    } catch (colErr) {
      console.error(`❌ Failed to migrate collection '${colName}':`, colErr);
      report.push({ name: colName, error: colErr.message });
    }
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n================================================================`);
  console.log(` Migration Summary (${durationSec} seconds)`);
  console.log(`================================================================`);
  let totalDocs = 0;
  for (const r of report) {
    if (r.error) {
      console.log(` ❌ ${r.name.padEnd(25)}: ERROR - ${r.error}`);
    } else {
      console.log(` ✅ ${r.name.padEnd(25)}: ${r.migrated}/${r.total}`);
      totalDocs += r.migrated;
    }
  }
  console.log(`----------------------------------------------------------------`);
  console.log(` Total Documents Migrated: ${totalDocs}`);
  console.log(` Destination Project:     ${TARGET_PROJECT}`);
  console.log(`================================================================\n`);

  process.exit(0);
}

run().catch(err => {
  console.error("Fatal migration error:", err);
  process.exit(1);
});
