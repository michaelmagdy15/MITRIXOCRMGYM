import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: 'faa-test-guide-v2'
  });
}

async function run() {
  console.log('Testing Firestore connection...');
  try {
    const strikeDb = getFirestore('(default)');
    const strikeSnap = await strikeDb.collection('clients').limit(3).get();
    console.log('Strike clients sample count:', strikeSnap.size);
    strikeSnap.docs.forEach(d => console.log('Strike client:', d.id, d.data().name || d.data().fullName));

    const inzanDb = getFirestore('db-inzanathletics');
    const inzanSnap = await inzanDb.collection('clients').limit(3).get();
    console.log('Inzan clients sample count:', inzanSnap.size);
    inzanSnap.docs.forEach(d => console.log('Inzan client:', d.id, d.data().name || d.data().fullName));
  } catch (err) {
    console.error('Connection error:', err);
  }
}

run();
