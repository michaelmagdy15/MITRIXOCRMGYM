const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

admin.initializeApp({
  projectId: 'faa-test-guide-v2'
});

async function main() {
  try {
    const db = getFirestore('db-gyma');
    console.log('Got Firestore reference');
    await db.collection('test').doc('ping').set({ timestamp: new Date().toISOString() });
    console.log('Write succeeded!');
  } catch (err) {
    console.error('Write failed:', err);
  }
}

main();
