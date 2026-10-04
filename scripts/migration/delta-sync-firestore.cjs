/**
 * Strike CRM -> Delta Sync Utility
 * 
 * Used during the final 5-minute cutover window to capture any last-minute
 * payments, member sign-ups, or session attendance recorded right before DNS switch.
 */

const admin = require('firebase-admin');
const fs = require('fs');

const SOURCE_PROJECT = process.env.SOURCE_PROJECT || 'faa-test-guide-v2';
const TARGET_PROJECT = process.argv[2] || process.env.TARGET_PROJECT;
const TARGET_KEY_PATH = process.argv[3] || process.env.TARGET_SERVICE_ACCOUNT_KEY;

if (!TARGET_PROJECT) {
  console.log(`Usage: node delta-sync-firestore.cjs <TARGET_PROJECT_ID> [TARGET_SERVICE_ACCOUNT_KEY_PATH]`);
  process.exit(1);
}

const sourceApp = admin.initializeApp({ projectId: SOURCE_PROJECT }, 'source-delta-app');

let targetAppOptions = { projectId: TARGET_PROJECT };
if (TARGET_KEY_PATH && fs.existsSync(TARGET_KEY_PATH)) {
  const serviceAccount = JSON.parse(fs.readFileSync(TARGET_KEY_PATH, 'utf8'));
  targetAppOptions.credential = admin.credential.cert(serviceAccount);
}
const targetApp = admin.initializeApp(targetAppOptions, 'target-delta-app');

const sourceDb = sourceApp.firestore();
const targetDb = targetApp.firestore();

// High-velocity collections that record ongoing gym activity
const HIGH_VELOCITY_COLLECTIONS = [
  'clients',
  'payments',
  'sessions',
  'classBookings',
  'attendance',
  'attendance_logs',
  'auditLogs',
  'counters'
];

async function runDeltaSync() {
  console.log(`=== Starting Fast Delta-Sync to ${TARGET_PROJECT} ===\n`);
  let syncedCount = 0;

  for (const colName of HIGH_VELOCITY_COLLECTIONS) {
    const [sourceSnap, targetSnap] = await Promise.all([
      sourceDb.collection(colName).get(),
      targetDb.collection(colName).get()
    ]);

    const targetMap = new Map();
    targetSnap.docs.forEach(doc => {
      targetMap.set(doc.id, JSON.stringify(doc.data()));
    });

    let batch = targetDb.batch();
    let countInBatch = 0;
    let colSynced = 0;

    for (const doc of sourceSnap.docs) {
      const sourceStr = JSON.stringify(doc.data());
      const targetStr = targetMap.get(doc.id);

      // If target doesn't exist or data is different, upsert
      if (!targetStr || targetStr !== sourceStr) {
        batch.set(targetDb.collection(colName).doc(doc.id), doc.data());
        countInBatch++;
        colSynced++;
        syncedCount++;

        if (countInBatch >= 400) {
          await batch.commit();
          batch = targetDb.batch();
          countInBatch = 0;
        }
      }
    }

    if (countInBatch > 0) {
      await batch.commit();
    }
    console.log(`✓ Delta check complete for: ${colName.padEnd(20)} (${colSynced} new/updated docs synced)`);
  }

  console.log(`\n🎉 Delta-Sync Finished: ${syncedCount} updated/new documents synced.`);
  process.exit(0);
}

runDeltaSync().catch(err => {
  console.error("Delta-sync error:", err);
  process.exit(1);
});
