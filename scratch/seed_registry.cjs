const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// Initialize admin
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

const db = getFirestore(process.argv[2] || 'db-registry');

async function main() {
  console.log('--- Seeding db-registry ---');
  
  // 1. settings/branding
  await db.collection('settings').doc('branding').set({
    companyName: 'Platform Super Admin Hub',
    logoUrl: ''
  });
  console.log('✔ Seeded settings/branding');

  // 2. settings/features
  await db.collection('settings').doc('features').set({
    leads: false,
    ptPackages: false,
    payments: false,
    attendance: false,
    reports: false,
    quotes: false,
    operations: false,
    mobileApp: false
  });
  console.log('✔ Seeded settings/features');

  // 3. settings/branches
  await db.collection('settings').doc('branches').set({
    branches: ['Registry Branch']
  });
  console.log('✔ Seeded settings/branches');

  // 4. settings/commission
  await db.collection('settings').doc('commission').set({
    ptRate: 0,
    groupRate: 0
  });
  console.log('✔ Seeded settings/commission');

  // 5. settings/sales-target
  await db.collection('settings').doc('sales-target').set({
    targetAmount: 0
  });
  console.log('✔ Seeded settings/sales-target');

  // 6. Users
  const admins = [
    {
      uid: 'RJIBk1vcsXZ02ARucdPcOhmhkBf2',
      email: 'michaelmitry13@gmail.com',
      name: 'Michael Mitry'
    },
    {
      uid: 'YKvlSsPKnbYNDDmEnXScQLEPv2f2',
      email: 'magd.gallab@gmail.com',
      name: 'Magd Gallab'
    }
  ];

  for (const adm of admins) {
    await db.collection('users').doc(adm.uid).set({
      id: adm.uid,
      email: adm.email,
      name: adm.name,
      role: 'crm_admin',
      createdAt: new Date().toISOString()
    });
    console.log(`✔ Seeded user: ${adm.email} (${adm.uid})`);
  }

  console.log('--- Seeding db-registry Complete! ---');
}

main().catch(console.error);
