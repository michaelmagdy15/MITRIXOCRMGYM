const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const PROJECT_ID = 'faa-test-guide-v2';

// ===============================================================
// Database → Rules file mapping
// ===============================================================
// The (default) database uses firestore.rules (contains Strike + Matchmaking + ATPL + Gamén rules)
// All tenant databases use firestore-tenant.rules (clean gym-only rules)
// The db-registry-2 database uses the main firestore.rules (admin access)
const DEFAULT_RULES_DATABASES = new Set(['(default)', 'db-registry-2']);

// All known databases to deploy rules to
const DATABASES = ['(default)', 'db-test', 'db-testrules', 'db-gyma', 'db-inzanathletics', 'db-registry-2'];

function getRulesFileForDatabase(databaseId) {
  if (DEFAULT_RULES_DATABASES.has(databaseId)) {
    return 'firestore.rules'; // Original rules with Strike + Matchmaking + ATPL + Gamén
  }
  // All other databases get the clean tenant-only rules
  const tenantRulesPath = path.join(__dirname, 'firestore-tenant.rules');
  if (fs.existsSync(tenantRulesPath)) {
    return 'firestore-tenant.rules';
  }
  // Fallback to original rules if tenant rules don't exist yet
  console.warn(`[Rules Deploy] firestore-tenant.rules not found, falling back to firestore.rules for "${databaseId}"`);
  return 'firestore.rules';
}

async function deployFirestoreRules(projectId, databaseId, accessToken) {
  const rulesFile = getRulesFileForDatabase(databaseId);
  console.log(`[Rules Deploy] Deploying "${rulesFile}" to database "${databaseId}"...`);
  
  const rulesPath = path.join(__dirname, rulesFile);
  if (!fs.existsSync(rulesPath)) {
    throw new Error(`Rules file not found at: ${rulesPath}`);
  }
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  
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
    throw new Error(`Failed to create ruleset: ${errText}`);
  }
  
  const ruleset = await rulesetRes.json();
  const rulesetName = ruleset.name;
  console.log(`[Rules Deploy] Ruleset created: ${rulesetName}`);
  
  // 2. Create/Update Release
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
      console.log(`[Rules Deploy] Release already exists. Patching to target new ruleset...`);
      
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
        throw new Error(`Failed to update release: ${patchErr}`);
      }
      console.log(`[Rules Deploy] Rules release updated successfully for "${databaseId}" (using ${rulesFile}).`);
      return;
    }
    throw new Error(`Failed to create release: ${errText}`);
  }
  
  console.log(`[Rules Deploy] Rules release created successfully for "${databaseId}" (using ${rulesFile}).`);
}

async function main() {
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;
    
    if (!accessToken) {
      throw new Error('Failed to retrieve GCP access token.');
    }
    
    console.log(`[Rules Deploy] Starting deployment across ${DATABASES.length} databases...`);
    console.log(`[Rules Deploy] (default) + db-registry-2 → firestore.rules (Strike/Matchmaking/ATPL/Gamén)`);
    console.log(`[Rules Deploy] All other DBs → firestore-tenant.rules (clean gym-only rules)`);
    console.log('');

    for (const dbId of DATABASES) {
      try {
        await deployFirestoreRules(PROJECT_ID, dbId, accessToken);
      } catch (err) {
        console.error(`[Error] Failed to deploy rules to database "${dbId}":`, err.message);
      }
    }
    console.log('[Rules Deploy] Completed deployment process across all databases.');
  } catch (error) {
    console.error('[Fatal Error] Rules deployment failed:', error);
  }
}

main();
