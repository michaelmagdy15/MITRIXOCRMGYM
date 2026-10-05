import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function check(name, source, standalone = false) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
    encoding: 'utf8',
    env: { ...process.env, STANDALONE_MODE: String(standalone), VITE_STANDALONE_MODE: 'false', STANDALONE_TENANT_ID: 'strike' },
  });
  assert.equal(result.status, 0, `${name}\n${result.stdout}\n${result.stderr}`);
  console.log(`PASS ${name}`);
}

check('Central hostname routing keeps project/database pairs isolated', `
  import assert from 'node:assert/strict';
  const { getTenantInfoForHost } = await import('./src/utils/tenantDb.ts');
  for (const host of ['admin.inzanathletics.com', 'inzanathletics.mitrixo.com', 'inzan.localhost']) {
    const { config } = await getTenantInfoForHost(host);
    assert.equal(config.projectId, 'faa-test-guide-v2');
    assert.equal(config.firestoreDatabaseId, 'db-inzanathletics');
  }
  const { config } = await getTenantInfoForHost('strike-egy.com');
  assert.equal(config.projectId, 'strike-production-f5242');
  assert.equal(config.firestoreDatabaseId, undefined);
`);

check('Strike standalone refuses Inzan hostnames', `
  import assert from 'node:assert/strict';
  const { getTenantInfoForHost } = await import('./src/utils/tenantDb.ts');
  await assert.rejects(getTenantInfoForHost('admin.inzanathletics.com'), /central deployment/);
  const { config } = await getTenantInfoForHost('strike-egy.com');
  assert.equal(config.projectId, 'strike-production-f5242');
  assert.equal(config.tenantId, 'strike');
`, true);

for (const injected of [false, true]) {
  check(`Inzan browser configuration (mixed injection: ${injected})`, `
    import assert from 'node:assert/strict';
    globalThis.window = {
      location: { hostname: 'admin.inzanathletics.com', search: '' },
      __FIREBASE_CONFIG__: ${injected ? JSON.stringify({ projectId: 'strike-production-f5242', tenantId: 'inzanathletics', firestoreDatabaseId: 'db-inzanathletics' }) : 'undefined'}
    };
    const { activeConfig, auth, db } = await import('./src/firebase.ts');
    assert.equal(activeConfig.projectId, 'faa-test-guide-v2');
    assert.equal(activeConfig.firestoreDatabaseId, 'db-inzanathletics');
    assert.equal(auth.app.options.projectId, 'faa-test-guide-v2');
    assert.equal(db.app.options.projectId, 'faa-test-guide-v2');
    const { deleteApp } = await import('firebase/app');
    await deleteApp(auth.app);
  `);
}

assert.doesNotMatch(readFileSync('Dockerfile', 'utf8'), /^ENV STANDALONE_MODE=true/m);
assert.match(readFileSync('.github/workflows/deploy-strike-dedicated.yml', 'utf8'), /STANDALONE_MODE=true,STANDALONE_TENANT_ID=strike/);
console.log('PASS only the dedicated Strike deployment enables standalone mode');
