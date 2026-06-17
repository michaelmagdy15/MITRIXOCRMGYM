const { GoogleAuth } = require('google-auth-library');

async function main() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = tokenResponse.token;
  
  const projectId = 'faa-test-guide-v2';
  const rulesetId = '17e5057d-a487-48e2-835a-1c0c1250a1b6';
  const url = `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets/${rulesetId}`;
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  const data = await res.json();
  console.log('Ruleset name:', data.name);
  if (data.source && data.source.files && data.source.files[0]) {
    console.log('Ruleset source content snippet (first 1000 chars):');
    console.log(data.source.files[0].content.substring(0, 1000));
  } else {
    console.log('No source content found:', data);
  }
}

main().catch(console.error);
