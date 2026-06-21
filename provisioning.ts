import fs from 'fs';
import path from 'path';
import { GoogleAuth } from 'google-auth-library';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

// ===============================================================
// Reserved tenant IDs — these can NEVER be provisioned
// ===============================================================
const RESERVED_TENANT_IDS = new Set([
  'strike', 'strikeboxing', 'dashboard', 'superadmin', 'admin',
  'www', 'api', 'app', 'test', 'staging', 'dev', 'mail', 'smtp',
  'ftp', 'cdn', 'static', 'assets', 'mitrixo', 'default', 'registry',
  'registry-2', 'test', 'testrules', 'gyma', 'inzanathletics',
]);

// ===============================================================
// Package tier → feature flags mapping
// ===============================================================
const TIER_FEATURES: Record<string, Record<string, boolean>> = {
  starter: {
    leads: false, ptPackages: false, payments: true, attendance: true,
    reports: true, quotes: false, operations: false, mobileApp: false,
    juiceBar: false, locker: false, qrCheckin: true, pointsSystem: false, wallet: false
  },
  professional: {
    leads: true, ptPackages: true, payments: true, attendance: true,
    reports: true, quotes: true, operations: false, mobileApp: false,
    juiceBar: false, locker: false, qrCheckin: true, pointsSystem: false, wallet: false
  },
  premium: {
    leads: true, ptPackages: true, payments: true, attendance: true,
    reports: true, quotes: true, operations: true, mobileApp: true,
    juiceBar: true, locker: true, qrCheckin: true, pointsSystem: true, wallet: true
  },
};

// Get default project ID from config
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

// Override Cloud Run host project environment variables to target our Firestore/Auth project
process.env.GOOGLE_CLOUD_PROJECT = defaultProjectId;
process.env.GCP_PROJECT = defaultProjectId;

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
  enableMobileApp?: boolean;
  packageTier?: 'starter' | 'professional' | 'premium'; // Subscription tier
}

/**
 * Programmatically creates a Firestore database instance within the GCP/Firebase project.
 * Uses the GCP Firestore Resource Manager REST API.
 */
export async function createFirestoreDatabase(projectId: string, databaseId: string, accessToken: string, locationId: string = 'europe-west1') {
  console.log(`[Provisioning] Creating Firestore database "${databaseId}" in project "${projectId}"...`);
  
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
 * Programmatically deploys Firestore security rules to a named database.
 * Uses the Firebase Rules REST API.
 */
export async function deployFirestoreRules(projectId: string, databaseId: string, accessToken: string) {
  console.log(`[Provisioning] Deploying Firestore security rules to "${databaseId}"...`);
  
  let rulesContent: string;
  const tenantRulesPath = path.join(process.cwd(), 'firestore-tenant.rules');
  if (fs.existsSync(tenantRulesPath)) {
    rulesContent = fs.readFileSync(tenantRulesPath, 'utf8');
  } else {
    // Fallback to the original rules if tenant rules file doesn't exist yet
    const fallbackPath = path.join(process.cwd(), 'firestore.rules');
    if (!fs.existsSync(fallbackPath)) {
      throw new Error(`Neither firestore-tenant.rules nor firestore.rules found at: ${process.cwd()}`);
    }
    console.log(`[Provisioning] firestore-tenant.rules not found, using firestore.rules as fallback.`);
    rulesContent = fs.readFileSync(fallbackPath, 'utf8');
  }
  
  // 1. Create Ruleset
  const rulesetUrl = `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`;
  const rulesetRes = await fetch(rulesetUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: {
        files: [
          {
            name: 'firestore.rules',
            content: rulesContent,
          }
        ]
      }
    }),
  });
  
  if (!rulesetRes.ok) {
    const errText = await rulesetRes.text();
    throw new Error(`Failed to create Firestore ruleset: ${errText}`);
  }
  
  const ruleset = await rulesetRes.json();
  const rulesetName = ruleset.name; // projects/{projectId}/rulesets/{rulesetId}
  console.log(`[Provisioning] Ruleset created successfully: ${rulesetName}`);
  
  // 2. Create Release
  const releaseUrl = `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`;
  const releaseName = `projects/${projectId}/releases/cloud.firestore/${databaseId}`;
  
  const releaseRes = await fetch(releaseUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: releaseName,
      rulesetName: rulesetName,
    }),
  });
  
  if (!releaseRes.ok) {
    const errText = await releaseRes.text();
    if (releaseRes.status === 409 || errText.includes('ALREADY_EXISTS') || errText.includes('already exists')) {
      console.log(`[Provisioning] Release "${releaseName}" already exists. Updating it via PATCH...`);
      
      const patchUrl = `https://firebaserules.googleapis.com/v1/${releaseName}`;
      const patchRes = await fetch(patchUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          release: {
            name: releaseName,
            rulesetName: rulesetName,
          },
          updateMask: 'rulesetName',
        }),
      });
      
      if (!patchRes.ok) {
        const patchErr = await patchRes.text();
        throw new Error(`Failed to update Firestore rules release: ${patchErr}`);
      }
      console.log(`[Provisioning] Rules release updated successfully.`);
      return;
    }
    throw new Error(`Failed to create Firestore rules release: ${errText}`);
  }
  
  console.log(`[Provisioning] Rules release created successfully for "${databaseId}".`);
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
  
  // 1.5 Seed settings/features based on package tier
  const tier = details.packageTier || 'premium'; // Default to premium if not specified
  const tierFeatures = TIER_FEATURES[tier] ?? TIER_FEATURES.premium!;
  await db.collection('settings').doc('features').set({
    ...tierFeatures,
    mobileApp: !!details.enableMobileApp || tierFeatures.mobileApp,
  });

  // 1.6 Seed settings/subscription for tier tracking
  await db.collection('settings').doc('subscription').set({
    tier: tier,
    startDate: new Date().toISOString(),
    renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // +30 days
    status: 'active',
    paymentMethod: 'pending',
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
  
  // ========== SAFETY GUARDS ==========
  
  // Guard 1: Prevent provisioning reserved tenant IDs
  if (RESERVED_TENANT_IDS.has(details.tenantId.toLowerCase())) {
    throw new Error(`BLOCKED: Tenant ID "${details.tenantId}" is reserved and cannot be provisioned.`);
  }
  
  // Guard 2: NEVER allow provisioning to (default) database — that's Strike's DB
  if (databaseId === '(default)' || details.tenantId === 'default' || details.tenantId === '(default)') {
    throw new Error('BLOCKED: Cannot provision to the (default) database. This would overwrite Strike\'s data.');
  }
  
  // Guard 3: Validate tenant ID format (alphanumeric + hyphens only)
  if (!/^[a-z0-9-]+$/.test(details.tenantId)) {
    throw new Error(`Invalid tenant ID "${details.tenantId}". Must contain only lowercase letters, numbers, and hyphens.`);
  }
  
  console.log(`[Provisioning] ✅ Safety checks passed for tenant "${details.tenantId}" → database "${databaseId}"`);
  
  try {
    // Get OAuth2 Access Token first
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;
    
    if (!accessToken) {
      throw new Error('Failed to retrieve GCP access token for provisioning.');
    }

    // 1. Create Firestore Database
    await createFirestoreDatabase(projectId, databaseId, accessToken, details.locationId || 'europe-west1');
    
    // 2. Deploy security rules to the new database
    await deployFirestoreRules(projectId, databaseId, accessToken);
    
    // Wait for database instance activation (Firestore creation can take a few seconds)
    console.log('[Provisioning] Waiting 10 seconds for database activation...');
    await new Promise((resolve) => setTimeout(resolve, 10000));
    
    // 3. Seed database
    const seedResult = await seedTenantDatabase(databaseId, details);
    
    // 4. Register tenant in central db-registry database
    console.log(`[Provisioning] Registering tenant "${details.tenantId}" in central db-registry...`);
    const centralDb = getFirestore('db-registry-2');
    await centralDb.collection('tenants').doc(details.tenantId).set({
      id: details.tenantId,
      subdomain: details.tenantId,
      databaseId,
      gymName: details.tenantName,
      status: 'active',
      createdAt: new Date().toISOString(),
    });

    // 5. Fire welcome email with temporary password and instructions
    try {
      await sendWelcomeEmail(
        details.ownerEmail,
        details.ownerName,
        details.tenantName,
        details.tenantId,
        seedResult.temporaryPassword
      );
    } catch (emailErr) {
      console.error('[Provisioning] Failed to send welcome email:', emailErr);
    }
    
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

/**
 * Sends a welcome email using Nodemailer with SMTP settings from environment variables.
 */
async function sendWelcomeEmail(toEmail: string, ownerName: string, gymName: string, subdomain: string, temporaryPassword: string) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromEmail = process.env.FROM_EMAIL || 'no-reply@mitrixogymcrm.com';

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn('[Provisioning] SMTP credentials not fully set in environment. Welcome email logged to console:');
    console.log('--------------------------------------------------');
    console.log(`To: ${toEmail}`);
    console.log(`Subject: Welcome to ${gymName} CRM!`);
    console.log(`Portal URL: https://${subdomain}.mitrixo.com`);
    console.log(`Username/Email: ${toEmail}`);
    console.log(`Temporary Password: ${temporaryPassword}`);
    console.log('--------------------------------------------------');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // true for 465, false for other ports
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  const appUrl = `https://${subdomain}.mitrixo.com`;

  const mailOptions = {
    from: `"Mitrixo CRM Support" <${fromEmail}>`,
    to: toEmail,
    subject: `Welcome to ${gymName} CRM - Access Details`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #09090b; color: #ffffff;">
        <h2 style="color: #f43f5e; border-bottom: 1px solid #27272a; padding-bottom: 10px; text-transform: uppercase;">Welcome to ${gymName} CRM!</h2>
        <p style="color: #a1a1aa;">Hello <strong>${ownerName}</strong>,</p>
        <p style="color: #a1a1aa;">Your gym workspace and database have been successfully provisioned. Here are your access details:</p>
        
        <div style="background-color: #18181b; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #27272a;">
          <p style="margin: 5px 0; color: #f43f5e;"><strong>Portal URL:</strong> <a href="${appUrl}" style="color: #60a5fa; text-decoration: none;">${appUrl}</a></p>
          <p style="margin: 5px 0; color: #ffffff;"><strong>Username / Email:</strong> ${toEmail}</p>
          <p style="margin: 5px 0; color: #ffffff;"><strong>Temporary Password:</strong> <code style="background: #27272a; padding: 2px 6px; border-radius: 4px; color: #ffffff;">${temporaryPassword}</code></p>
        </div>
        
        <p style="color: #a1a1aa; font-size: 13px;">* For security reasons, you will be prompted to change your password immediately upon your first sign-in.</p>
        <hr style="border: none; border-top: 1px solid #27272a; margin: 20px 0;" />
        <p style="color: #71717a; font-size: 11px; text-align: center;">Powered by Mitrixo CRM Systems</p>
      </div>
    `
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`[Provisioning] Welcome email sent successfully: ${info.messageId}`);
}
