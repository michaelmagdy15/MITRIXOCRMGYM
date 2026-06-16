import { initializeApp } from 'firebase/app';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import fs from 'fs';

const configStr = fs.readFileSync('./firebase-applet-config.json', 'utf-8');
const firebaseConfig = JSON.parse(configStr);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const email = 'magd.gallab@gmail.com';

async function sendReset() {
  try {
    console.log(`Sending password reset email to ${email}...`);
    await sendPasswordResetEmail(auth, email);
    console.log(`Successfully sent password reset email to ${email}. He can click the link to set his password and then login normally.`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

sendReset();
