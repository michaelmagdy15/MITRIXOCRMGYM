import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';

// ============================================================================
// MITRIXOGYMCRM BOXING CRM - CROSS-PROJECT DATABASE MIGRATION SCRIPT
// ============================================================================
// Instructions to run this:
// 1. You are migrating between TWO separate Google Cloud projects. You need TWO service account keys:
//
//    A. OLD PROJECT (gen-lang-client-0565330624 / AI Studio):
//       Go to Firebase Console -> Project Settings -> Service Accounts -> "Generate new private key"
//       Download and save the file here as: old-service-account.json
//
//    B. NEW PROJECT (faa-test-guide-v2 / crm-production):
//       Go to Firebase Console -> Project Settings -> Service Accounts -> "Generate new private key"
//       Download and save the file here as: new-service-account.json
//
// 2. Open terminal in this folder and run: npm install firebase-admin
// 3. Run the script: node migrate-db.js
// ============================================================================

if (!existsSync('./old-service-account.json') || !existsSync('./new-service-account.json')) {
  console.error('❌ ERROR: Missing service account files!');
  console.error('Please ensure both "old-service-account.json" and "new-service-account.json" are in this folder.');
  process.exit(1);
}

try {
  const oldServiceAccount = JSON.parse(readFileSync('./old-service-account.json', 'utf8'));
  const newServiceAccount = JSON.parse(readFileSync('./new-service-account.json', 'utf8'));

  // Initialize both apps
  const oldApp = initializeApp({
    credential: cert(oldServiceAccount)
  }, 'oldApp');

  const newApp = initializeApp({
    credential: cert(newServiceAccount)
  }, 'newApp');

  // The old database ID
  const oldDb = getFirestore(oldApp, 'ai-studio-3bf9459f-b695-4194-82c1-3b715e42610f');
  
  // The new database (default in the new project faa-test-guide-v2)
  const newDb = getFirestore(newApp);

  const collectionsToMigrate = [
    'users',
    'clients',
    'payments',
    'attendance',
    'tasks',
    'interactions',
    'importBatches',
    'sessions',
    'auditLogs',
    'packages',
    'coaches',
    'settings',
    'targets',
    'counters'
  ];

  async function migrateCollection(collectionName) {
    console.log(`Migrating collection: ${collectionName}...`);
    const snapshot = await oldDb.collection(collectionName).get();
    
    if (snapshot.empty) {
      console.log(`  -> No documents found in ${collectionName}.`);
      return;
    }

    let batch = newDb.batch();
    let count = 0;
    let total = 0;

    for (const doc of snapshot.docs) {
      const newDocRef = newDb.collection(collectionName).doc(doc.id);
      batch.set(newDocRef, doc.data());
      count++;
      total++;

      if (count === 400) {
        await batch.commit();
        batch = newDb.batch();
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }

    console.log(`  -> Successfully migrated ${total} documents in ${collectionName}.`);
  }

  async function migrateAll() {
    console.log('Starting migration from ai-studio to crm-production (faa-test-guide-v2) database...\n');
    try {
      for (const coll of collectionsToMigrate) {
        await migrateCollection(coll);
      }

      // Special case for subcollections according to firestore.rules:
      // /clients/{clientId}/comments
      // /clients/{clientId}/interactions
      console.log('\nChecking for client subcollections (comments & interactions)...');
      const clientsSnap = await oldDb.collection('clients').get();
      let subCount = 0;
      
      for (const clientDoc of clientsSnap.docs) {
        // Migrate comments
        const commentsSnap = await clientDoc.ref.collection('comments').get();
        if (!commentsSnap.empty) {
          let batch = newDb.batch();
          commentsSnap.forEach(commentDoc => {
            batch.set(newDb.collection('clients').doc(clientDoc.id).collection('comments').doc(commentDoc.id), commentDoc.data());
            subCount++;
          });
          await batch.commit();
        }
        
        // Migrate interactions
        const interactionsSnap = await clientDoc.ref.collection('interactions').get();
        if (!interactionsSnap.empty) {
          let batch = newDb.batch();
          interactionsSnap.forEach(interactionDoc => {
            batch.set(newDb.collection('clients').doc(clientDoc.id).collection('interactions').doc(interactionDoc.id), interactionDoc.data());
            subCount++;
          });
          await batch.commit();
        }
      }
      
      if (subCount > 0) {
        console.log(`  -> Successfully migrated ${subCount} subcollection documents.`);
      } else {
        console.log(`  -> No subcollection documents found.`);
      }

      console.log('\n✅ Migration Complete!');
      console.log('Your React application has already been updated to point to the new faa-test-guide-v2 database.');
    } catch (error) {
      console.error('Migration failed:', error);
    }
  }

  migrateAll();
} catch (error) {
  console.error('❌ ERROR:', error);
}
