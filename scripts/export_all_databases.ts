import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: 'faa-test-guide-v2'
  });
}

async function exportCollection(db: FirebaseFirestore.Firestore, collectionName: string) {
  const snapshot = await db.collection(collectionName).get();
  const docs = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  return docs;
}

async function exportDatabase(databaseId: string, name: string) {
  console.log(`\n==============================================`);
  console.log(`Exporting snapshot of database: ${name} (${databaseId})`);
  console.log(`==============================================`);
  
  const db = databaseId === '(default)' ? getFirestore() : getFirestore(databaseId);
  const collections = await db.listCollections();
  const collectionNames = collections.map(c => c.id);
  console.log(`Found ${collectionNames.length} collections:`, collectionNames.join(', '));

  const result: Record<string, any[]> = {};
  let totalDocs = 0;

  for (const colName of collectionNames) {
    try {
      const docs = await exportCollection(db, colName);
      result[colName] = docs;
      totalDocs += docs.length;
      console.log(`  - ${colName}: ${docs.length} documents`);
    } catch (err: any) {
      console.error(`  - Failed to export collection ${colName}:`, err.message);
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(process.cwd(), 'backups', 'snapshots');
  fs.mkdirSync(backupDir, { recursive: true });

  const filename = `${name}_snapshot_${timestamp}.json`;
  const latestFilename = `${name}_latest.json`;
  
  const metaWrapper = {
    _meta: {
      databaseId,
      tenantName: name,
      exportedAt: new Date().toISOString(),
      totalCollections: Object.keys(result).length,
      totalDocuments: totalDocs
    },
    ...result
  };

  fs.writeFileSync(path.join(backupDir, filename), JSON.stringify(metaWrapper, null, 2), 'utf8');
  fs.writeFileSync(path.join(backupDir, latestFilename), JSON.stringify(metaWrapper, null, 2), 'utf8');
  
  console.log(`Saved snapshot to: backups/snapshots/${filename}`);
  console.log(`Updated latest snapshot: backups/snapshots/${latestFilename} (Total Docs: ${totalDocs})`);

  return result;
}

async function main() {
  console.log('Starting full multi-tenant database snapshot export...');
  
  // 1. Strike Boxing Club (default Firestore database)
  const strikeData = await exportDatabase('(default)', 'strike');

  // 2. Inzan Athletics (db-inzanathletics Firestore database)
  const inzanData = await exportDatabase('db-inzanathletics', 'inzanathletics');

  // 3. Central Multi-Tenant Registry (db-registry-2)
  try {
    await exportDatabase('db-registry-2', 'registry');
  } catch (err: any) {
    console.error('Error exporting db-registry-2:', err.message);
  }

  console.log('\nAll database snapshots downloaded and saved successfully!');
}

main().catch(err => {
  console.error('Fatal snapshot export error:', err);
  process.exit(1);
});
