const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const defaultProjectId = 'faa-test-guide-v2';
const serviceAccountPath = path.join(process.cwd(), 'service-account.json');

if (fs.existsSync(serviceAccountPath)) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
  });
} else {
  admin.initializeApp({
    projectId: defaultProjectId
  });
}

async function main() {
  const email = 'michaelmitry13@gmail.com';
  const newPassword = 'Miko0019';
  console.log(`Searching for user with email: ${email}...`);
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log(`Found user: ${userRecord.uid}. Updating password...`);
    await admin.auth().updateUser(userRecord.uid, {
      password: newPassword
    });
    console.log(`Successfully updated password for ${email} to "${newPassword}"!`);
  } catch (error) {
    console.error('Error updating user password:', error);
  }
}

main().catch(console.error);
