const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
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

const db = getFirestore('db-registry-2');

const tenants = [
  {
    id: 'strike',
    subdomain: 'strike',
    customDomain: 'dashboard.strikeboxing-eg.pro',
    databaseId: '(default)',
    gymName: 'Strike Boxing Club',
    status: 'active',
    createdAt: new Date().toISOString()
  },
  {
    id: 'gyma',
    subdomain: 'gyma',
    databaseId: 'db-gyma',
    gymName: 'Gym A',
    status: 'active',
    createdAt: new Date().toISOString()
  },
  {
    id: 'inzanathletics',
    subdomain: 'inzanathletics',
    databaseId: 'db-inzanathletics',
    gymName: 'Inzan Athletics',
    status: 'active',
    createdAt: new Date().toISOString()
  }
];

async function main() {
  console.log('--- Seeding Tenants into db-registry-2 ---');
  for (const tenant of tenants) {
    await db.collection('tenants').doc(tenant.id).set(tenant);
    console.log(`✔ Seeded tenant: ${tenant.gymName} (${tenant.id}) -> DB: ${tenant.databaseId}`);
  }
  console.log('--- Tenants Seeding Complete! ---');
}

main().catch(console.error);
