import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'faa-test-guide-v2' });
}

const db = getFirestore('db-inzanathletics');
const auth = getAuth();

const EMAIL = 'apple.reviewer@inzanathletics.com';
const PASSWORD = '12345678';
const DISPLAY_NAME = 'Apple Reviewer';

async function main() {
  console.log(`Checking Firebase Auth for ${EMAIL}...`);
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(EMAIL);
    console.log(`Found existing user with UID: ${userRecord.uid}`);
    await auth.updateUser(userRecord.uid, {
      password: PASSWORD,
      displayName: DISPLAY_NAME,
      disabled: false,
    });
    console.log(`Password reset to ${PASSWORD} and account enabled in Auth.`);
  } catch (err: any) {
    if (err.code === 'auth/user-not-found') {
      console.log(`User not found in Auth. Creating new user...`);
      userRecord = await auth.createUser({
        email: EMAIL,
        password: PASSWORD,
        displayName: DISPLAY_NAME,
        emailVerified: true,
        disabled: false,
      });
      console.log(`Created new Firebase Auth user with UID: ${userRecord.uid}`);
    } else {
      throw err;
    }
  }

  const uid = userRecord.uid;

  // 1. Ensure user document in db-inzanathletics/users
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const userData = {
    uid,
    name: DISPLAY_NAME,
    displayName: DISPLAY_NAME,
    email: EMAIL,
    role: 'client',
    active: true,
    mustChangePassword: false,
    updatedAt: new Date().toISOString(),
    ...(userSnap.exists ? {} : { createdAt: new Date().toISOString() })
  };
  await userRef.set(userData, { merge: true });
  console.log(`Updated user doc in db-inzanathletics/users/${uid}`);

  // 2. Ensure client document in db-inzanathletics/clients
  const clientSnap = await db.collection('clients').where('portalUserId', '==', uid).limit(1).get();
  let clientDocId = '';
  if (clientSnap.empty) {
    // Check by email
    const emailSnap = await db.collection('clients').where('email', '==', EMAIL).limit(1).get();
    if (!emailSnap.empty && emailSnap.docs[0]) {
      clientDocId = emailSnap.docs[0].id;
      await db.collection('clients').doc(clientDocId).update({
        portalUserId: uid,
        name: DISPLAY_NAME,
        status: 'active',
        active: true,
      });
      console.log(`Linked existing client record ${clientDocId} to UID ${uid}`);
    } else {
      const newClientRef = db.collection('clients').doc();
      clientDocId = newClientRef.id;
      await newClientRef.set({
        name: DISPLAY_NAME,
        email: EMAIL,
        phone: '+201000000000',
        memberId: 'MEM-APP-REV',
        portalUserId: uid,
        status: 'active',
        active: true,
        gender: 'male',
        branch: 'Main Branch',
        membershipType: 'VIP All-Access',
        sessionsRemaining: 20,
        createdAt: new Date().toISOString(),
      });
      console.log(`Created new client record ${clientDocId} for ${DISPLAY_NAME}`);
    }
  } else if (clientSnap.docs[0]) {
    clientDocId = clientSnap.docs[0].id;
    await db.collection('clients').doc(clientDocId).update({
      status: 'active',
      active: true,
    });
    console.log(`Existing client record ${clientDocId} verified active.`);
  }

  console.log(`SUCCESS! Account ${EMAIL} is active with password ${PASSWORD}`);
}

main().catch(err => {
  console.error('FAILED to setup reviewer account:', err);
  process.exit(1);
});
