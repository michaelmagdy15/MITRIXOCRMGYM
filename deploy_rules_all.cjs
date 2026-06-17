const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const PROJECT_ID = 'faa-test-guide-v2';
const DATABASES = ['(default)', 'db-test', 'db-testrules', 'db-gyma', 'db-inzanathletics'];

async function deployFirestoreRules(projectId, databaseId, accessToken) {
  console.log(`[Rules Deploy] Deploying rules to "${databaseId}"...`);
  
  const rulesPath = path.join(__dirname, 'firestore.rules');
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
      console.log(`[Rules Deploy] Rules release updated successfully for "${databaseId}".`);
      return;
    }
    throw new Error(`Failed to create release: ${errText}`);
  }
  
  console.log(`[Rules Deploy] Rules release created successfully for "${databaseId}".`);
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
