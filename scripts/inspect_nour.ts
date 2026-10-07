import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'faa-test-guide-v2' });
}

const db = getFirestore('db-inzanathletics');

async function main() {
  const doc = await db.collection('users').doc('n8JimhK2uUN5HQEX2kZ6NOKrbrz2').get();
  console.log('Nour exists:', doc.exists);
  if (doc.exists) {
    console.log(JSON.stringify(doc.data(), null, 2));
  }
}

main().catch(console.error);
