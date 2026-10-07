import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'faa-test-guide-v2' });
}

const db = getFirestore('db-inzanathletics');

async function main() {
  const snap = await db.collection('packages').get();
  console.log(`Total packages in db-inzanathletics: ${snap.size}`);
  snap.forEach(d => {
    console.log(`- [${d.id}] ${d.data().name} (${d.data().price} LE, category: ${d.data().category}, type: ${d.data().type})`);
  });
}

main().catch(console.error);
