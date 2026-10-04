/**
 * Inspect and Purge VBT Camp items from Strike Dedicated Firestore (strike-production-f5242)
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const TARGET_PROJECT = process.argv[2] || process.env.TARGET_PROJECT || 'strike-production-f5242';
const TARGET_KEY_PATH = process.argv[3] || process.env.TARGET_SERVICE_ACCOUNT_KEY || path.resolve(__dirname, '../../strike-sa-key.json');

if (!fs.existsSync(TARGET_KEY_PATH)) {
  console.error(`Error: Service account key not found at ${TARGET_KEY_PATH}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(TARGET_KEY_PATH, 'utf8'));
const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: TARGET_PROJECT
}, 'purge-vbt-app');

const db = app.firestore();

const VBT_COLLECTIONS = [
  'vbt_camp',
  'vbt_camp_announcements',
  'vbt_push_tokens'
];

async function deleteCollection(collectionPath, batchSize = 400) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.limit(batchSize);

  let deletedCount = 0;
  while (true) {
    const snapshot = await query.get();
    if (snapshot.size === 0) {
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    deletedCount += snapshot.size;
    console.log(`  Deleted batch of ${snapshot.size} docs from ${collectionPath}... (Total: ${deletedCount})`);
  }

  return deletedCount;
}

async function searchOtherCollectionsForVbt() {
  console.log(`\nScanning common collections for references to 'vbt' or 'camp'...`);
  const collectionsToScan = ['packages', 'settings', 'classes', 'tasks', 'calendarEvents', 'systemNotifications'];
  
  for (const colName of collectionsToScan) {
    try {
      const snap = await db.collection(colName).get();
      const matches = [];
      snap.docs.forEach(doc => {
        const str = JSON.stringify(doc.data()).toLowerCase();
        if (str.includes('vbt') || str.includes('camp')) {
          matches.push({ id: doc.id, data: doc.data() });
        }
      });
      if (matches.length > 0) {
        console.log(`  🔍 Found ${matches.length} matching document(s) in '${colName}':`);
        matches.forEach(m => {
          console.log(`    - ID: ${m.id} | Summary:`, JSON.stringify(m.data).slice(0, 150));
        });
      } else {
        console.log(`  ✓ '${colName}': 0 references found`);
      }
    } catch (e) {
      console.warn(`  ⚠️ Could not scan '${colName}': ${e.message}`);
    }
  }
}

async function main() {
  console.log(`================================================================`);
  console.log(` Purge VBT Camp Items from ${TARGET_PROJECT}`);
  console.log(`================================================================\n`);

  // Step 1: Scan and purge dedicated VBT collections
  for (const colName of VBT_COLLECTIONS) {
    console.log(`Checking collection '${colName}'...`);
    const snap = await db.collection(colName).get();
    console.log(`Found ${snap.size} documents in '${colName}'.`);
    if (snap.size > 0) {
      const count = await deleteCollection(colName);
      console.log(`✅ Successfully purged ${count} documents from '${colName}'.\n`);
    } else {
      console.log(`✓ '${colName}' is already empty.\n`);
    }
  }

  // Step 2: Search for any nested or cross-collection VBT references
  await searchOtherCollectionsForVbt();

  console.log(`\n================================================================`);
  console.log(` VBT Purge Complete`);
  console.log(`================================================================\n`);
  process.exit(0);
}

main().catch(err => {
  console.error("Purge error:", err);
  process.exit(1);
});
