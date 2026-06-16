import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updatePassword } from 'firebase/auth';
import fs from 'fs';

const configStr = fs.readFileSync('./firebase-applet-config.json', 'utf-8');
const firebaseConfig = JSON.parse(configStr);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const email = 'magd.gallab@gmail.com';
const password = 'Password123!';

async function setupMagd() {
  try {
    // Try to create the user
    console.log(`Attempting to create user ${email}...`);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    console.log(`Successfully created user! UID: ${cred.user.uid}`);
    console.log(`Magd can now login with email: ${email} and password: ${password}`);
    process.exit(0);
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      console.log(`User already exists in Firebase Auth. Attempting to sign in to update password...`);
      // We can't update password without the old password if it exists, but wait, maybe they can just use the reset password functionality.
      console.log(`Account already exists. Magd should use the "Forgot password?" button on the login screen, or you can log in with Google.`);
    } else {
      console.error('Error:', err);
    }
    process.exit(1);
  }
}

setupMagd();
