const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { initializeFirestore, doc, getDoc } = require('firebase/firestore');
const fs = require('fs');

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));

async function testDatabase(dbId, authInstance, credential) {
  console.log(`\n--- Testing Database: "${dbId}" ---`);
  const appTmp = initializeApp(firebaseConfig, `app-${dbId}`);
  const db = initializeFirestore(appTmp, {}, dbId);
  
  // 1. Unauthenticated read
  console.log(`[${dbId}] 1. Attempting unauthenticated read to settings/branding...`);
  try {
    const snap = await getDoc(doc(db, 'settings', 'branding'));
    console.log(`[${dbId}]    ✔ Unauth read succeeded! Data:`, snap.exists() ? snap.data() : 'document not found');
  } catch (err) {
    console.error(`[${dbId}]    ❌ Unauth read failed:`, err.code, err.message);
  }

  // 2. Authenticated read (if credential is provided)
  if (credential) {
    const authTmp = getAuth(appTmp);
    console.log(`[${dbId}] 2. Signing in with email: ${credential.email}...`);
    try {
      const cred = await signInWithEmailAndPassword(authTmp, credential.email, credential.password);
      console.log(`[${dbId}]    ✔ Sign in succeeded! UID: ${cred.user.uid}`);
      
      console.log(`[${dbId}] 3. Attempting authenticated read to settings/branding...`);
      const snap = await getDoc(doc(db, 'settings', 'branding'));
      console.log(`[${dbId}]    ✔ Auth read settings succeeded! Data:`, snap.exists() ? snap.data() : 'document not found');

      console.log(`[${dbId}] 4. Attempting authenticated read to users/${cred.user.uid}...`);
      const userSnap = await getDoc(doc(db, 'users', cred.user.uid));
      console.log(`[${dbId}]    ✔ Auth read user doc succeeded! Data:`, userSnap.exists() ? userSnap.data() : 'document not found');
    } catch (err) {
      console.error(`[${dbId}]    ❌ Authenticated operations failed:`, err.code || err.message, err.message);
    }
  }
}

async function main() {
  console.log('=== Firestore Comprehensive Multi-DB & Auth Verification ===');
  
  // 1. First find which credentials work
  const defaultApp = initializeApp(firebaseConfig);
  const defaultAuth = getAuth(defaultApp);
  
  const passwords = ['Miko0019', 'Miko0019_!'];
  let successfulPassword = null;
  
  for (const pwd of passwords) {
    console.log(`Testing authentication with password: "${pwd}"...`);
    try {
      const cred = await signInWithEmailAndPassword(defaultAuth, 'michaelmitry13@gmail.com', pwd);
      console.log(`✔ Success! Authenticated UID: ${cred.user.uid}`);
      successfulPassword = pwd;
      break;
    } catch (err) {
      console.log(`❌ Failed with password "${pwd}":`, err.code || err.message);
    }
  }
  
  const credential = successfulPassword ? { email: 'michaelmitry13@gmail.com', password: successfulPassword } : null;
  
  if (!credential) {
    console.warn('⚠️ No credentials worked. Tests will run without authentication steps.');
  }

  // 2. Test the databases
  await testDatabase('db-test', defaultAuth, credential);
  await testDatabase('db-gyma', defaultAuth, credential);
  await testDatabase('db-registry', defaultAuth, credential);
  await testDatabase('db-registry-2', defaultAuth, credential);
  
  console.log('\n=============================================================');
}

main().catch(console.error);
