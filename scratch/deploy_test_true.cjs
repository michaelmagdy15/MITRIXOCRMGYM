const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const PROJECT_ID = 'faa-test-guide-v2';
const DATABASE_ID = 'db-registry-2';

async function main() {
  console.log(`[Test Deploy] Deploying open rules to "${DATABASE_ID}"...`);
  
  const rulesPath = path.join(process.cwd(), 'scratch', 'test_true.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = tokenResponse.token;
  
  // 1. Create Ruleset
  const rulesetUrl = `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/rulesets`;
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
  console.log(`[Test Deploy] Ruleset created: ${rulesetName}`);
  
  // 2. Patch Release
  const releaseName = `projects/${PROJECT_ID}/releases/cloud.firestore/${DATABASE_ID}`;
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
  console.log(`[Test Deploy] Release updated successfully for "${DATABASE_ID}".`);
}

main().catch(console.error);
