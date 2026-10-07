import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'faa-test-guide-v2' });
}

const db = getFirestore('db-inzanathletics');

async function main() {
  const snap = await db.collection('users').get();
  console.log(`Total users in db-inzanathletics: ${snap.size}`);
  snap.forEach(d => {
    const data = d.data();
    console.log(`- [${d.id}] ${data.name} <${data.email}> | role: ${data.role} | jobTitle: ${data.jobTitle} | dept: ${data.department} | tpl: ${data.permissionTemplateId}`);
  });
}

main().catch(console.error);
