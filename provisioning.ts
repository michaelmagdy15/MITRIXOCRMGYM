import fs from 'fs';
import path from 'path';
import { GoogleAuth } from 'google-auth-library';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize firebase-admin
// Automatically picks up Application Default Credentials (ADC) in Cloud Run,
// or uses service-account.json if present in the working directory for local testing.
const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
if (fs.existsSync(serviceAccountPath)) {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
    });
  }
} else {
  if (admin.apps.length === 0) {
    // Fallback to Application Default Credentials (ADC)
    const defaultConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
    let defaultProjectId = 'faa-test-guide-v2';
    if (fs.existsSync(defaultConfigPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));
        if (config.projectId) {
          defaultProjectId = config.projectId;
        }
      } catch (e) {
        console.error('Failed to read default project ID from config:', e);
      }
    }
    admin.initializeApp({
      projectId: defaultProjectId
    });
  }
}

interface ProvisionDetails {
  tenantId: string;      // e.g. "golds-gym"
  tenantName: string;    // e.g. "Gold's Gym"
  ownerEmail: string;    // e.g. "owner@goldsgym.com"
  ownerName: string;     // e.g. "John Doe"
  ownerPassword?: string; // e.g. "temporary-password"
  locationId?: string;   // e.g. "europe-west1"
}

/**
 * Programmatically creates a Firestore database instance within the GCP/Firebase project.
 * Uses the GCP Firestore Resource Manager REST API.
 */
export async function createFirestoreDatabase(projectId: string, databaseId: string, locationId: string = 'europe-west1') {
  console.log(`[Provisioning] Creating Firestore database "${databaseId}" in project "${projectId}"...`);
  
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = tokenResponse.token;
  
  if (!accessToken) {
    throw new Error('Failed to retrieve GCP access token for database creation.');
  }
  
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases?databaseId=${databaseId}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'FIRESTORE_NATIVE',
      locationId: locationId,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Provisioning] API Error: ${errorText}`);
    if (response.status === 409 || errorText.includes('ALREADY_EXISTS') || errorText.includes('already exists')) {
      console.log(`[Provisioning] Database "${databaseId}" already exists. Proceeding to seed.`);
      return { alreadyExists: true };
    }
    throw new Error(`Failed to create Firestore database: ${response.statusText} - ${errorText}`);
  }
  
  const result = await response.json();
  console.log(`[Provisioning] Database creation initiated:`, result);
  return result;
}

/**
 * Seeds the newly provisioned tenant database with defaults:
 * - default settings (branding, branches, targets, commission)
 * - super_admin user credentials
 * - default packages
 */
export async function seedTenantDatabase(databaseId: string, details: ProvisionDetails) {
  console.log(`[Provisioning] Seeding database "${databaseId}"...`);
  
  // Get reference to the specific database instance
  const db = getFirestore(databaseId);
  
  // 1. Seed settings/branding
  await db.collection('settings').doc('branding').set({
    companyName: details.tenantName,
    logoUrl: '', // empty to use dynamic text-based branding
  });
  
  // 2. Seed settings/branches
  await db.collection('settings').doc('branches').set({
    branches: ['Main Branch', 'Premium Branch'],
  });
  
  // 3. Seed settings/commission
  await db.collection('settings').doc('commission').set({
    ptRate: 8,
    groupRate: 5,
  });
  
  // 4. Seed settings/sales-target
  await db.collection('settings').doc('sales-target').set({
    targetAmount: 50000,
  });
  
  // 5. Create default packages
  const defaultPackages = [
    { name: 'Standard Package', price: 1000, sessions: 12, validityDays: 30, type: 'group' },
    { name: 'Premium Pack', price: 2500, sessions: 24, validityDays: 60, type: 'group' },
    { name: 'PT Starter Pack', price: 3000, sessions: 12, validityDays: 30, type: 'private' },
    { name: 'IMPACT HIIT Package', price: 1500, sessions: 8, validityDays: 30, type: 'group' },
  ];
  
  for (const pkg of defaultPackages) {
    await db.collection('packages').add({
      ...pkg,
      createdAt: new Date().toISOString(),
    });
  }
  
  // 6. Provision owner account in Firebase Auth
  const temporaryPassword = details.ownerPassword || Math.random().toString(36).substring(2, 10);
  console.log(`[Provisioning] Creating Auth user for email: ${details.ownerEmail}...`);
  
  const userRecord = await admin.auth().createUser({
    email: details.ownerEmail,
    password: temporaryPassword,
    displayName: details.ownerName,
  });
  
  // 7. Save owner profile in user collection
  await db.collection('users').doc(userRecord.uid).set({
    id: userRecord.uid,
    name: details.ownerName,
    email: details.ownerEmail,
    role: 'super_admin',
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  });
  
  console.log(`[Provisioning] Seeding complete! Database is ready.`);
  return {
    uid: userRecord.uid,
    temporaryPassword,
  };
}

/**
 * Coordinates the entire provisioning process: database creation, schema seeding, and owner profile setup.
 */
export async function provisionNewGym(details: ProvisionDetails) {
  const projectId = admin.instanceId().app.options.projectId || 'faa-test-guide-v2';
  const databaseId = `db-${details.tenantId}`;
  
  try {
    // 1. Create Firestore Database
    await createFirestoreDatabase(projectId, databaseId, details.locationId || 'europe-west1');
    
    // Wait for database instance activation (Firestore creation can take a few seconds)
    console.log('[Provisioning] Waiting 10 seconds for database activation...');
    await new Promise((resolve) => setTimeout(resolve, 10000));
    
    // 2. Seed database
    const seedResult = await seedTenantDatabase(databaseId, details);
    
    return {
      success: true,
      databaseId,
      ownerUid: seedResult.uid,
      temporaryPassword: seedResult.temporaryPassword,
    };
  } catch (error) {
    console.error('[Provisioning] Provisioning failed:', error);
    throw error;
  }
}
