import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const STRIKE_PROJECT_ID = 'strike-production-f5242';

async function checkStrike() {
  const app = initializeApp({ projectId: STRIKE_PROJECT_ID }, 'strike-verifier');
  const db = getFirestore(app);
  const clientsSnap = await db.collection('clients').count().get();
  const paymentsSnap = await db.collection('payments').count().get();
  const usersSnap = await db.collection('users').count().get();
  console.log(`STRIKE VERIFICATION:`);
  console.log(`  Clients  : ${clientsSnap.data().count}`);
  console.log(`  Payments : ${paymentsSnap.data().count}`);
  console.log(`  Users    : ${usersSnap.data().count}`);
}

checkStrike().catch(console.error);
