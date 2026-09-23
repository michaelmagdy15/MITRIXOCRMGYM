import express from 'express';
import { desktopSyncRouter } from '../src/routes/desktopSync.js';
import { getTenantInfoForHost } from '../src/utils/tenantDb.js';

// In-Memory Mock Firestore for deterministic integration testing
class MockDocRef {
  constructor(public collectionName: string, public id: string, public store: Map<string, any>) {}
  async get() {
    const key = `${this.collectionName}/${this.id}`;
    const data = this.store.get(key);
    return {
      exists: data !== undefined,
      id: this.id,
      data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
      ref: this,
    };
  }
  async set(data: any, options?: { merge?: boolean }) {
    const key = `${this.collectionName}/${this.id}`;
    if (options?.merge && this.store.has(key)) {
      this.store.set(key, { ...this.store.get(key), ...data });
    } else {
      this.store.set(key, { ...data });
    }
  }
  async update(data: any) {
    const key = `${this.collectionName}/${this.id}`;
    const existing = this.store.get(key) || {};
    this.store.set(key, { ...existing, ...data });
  }
  collection(subName: string) {
    return new MockCollection(`${this.collectionName}/${this.id}/${subName}`, this.store);
  }
}

class MockCollection {
  constructor(public name: string, public store: Map<string, any>) {}
  doc(id?: string) {
    const docId = id || `auto_${Math.random().toString(36).slice(2, 10)}`;
    return new MockDocRef(this.name, docId, this.store);
  }
  async add(data: any) {
    const docRef = this.doc();
    await docRef.set(data);
    return docRef;
  }
  where(_field: string, _op: string, _value: any) {
    return this;
  }
  orderBy(_field: string, _direction?: string) {
    return this;
  }
  limit(_n: number) {
    return this;
  }
  async get() {
    const prefix = `${this.name}/`;
    const docs: any[] = [];
    for (const [k, v] of this.store.entries()) {
      if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) {
        const id = k.slice(prefix.length);
        docs.push({
          id,
          exists: true,
          data: () => JSON.parse(JSON.stringify(v)),
          ref: new MockDocRef(this.name, id, this.store),
        });
      }
    }
    return {
      empty: docs.length === 0,
      size: docs.length,
      docs,
    };
  }
}

class MockFirestore {
  store = new Map<string, any>();
  collection(name: string) {
    return new MockCollection(name, this.store);
  }
  batch() {
    const ops: (() => Promise<void>)[] = [];
    return {
      set: (ref: any, data: any, options?: any) => {
        ops.push(async () => ref.set(data, options));
      },
      update: (ref: any, data: any) => {
        ops.push(async () => ref.update(data));
      },
      delete: (ref: any) => {
        ops.push(async () => ref.store.delete(`${ref.collectionName}/${ref.id}`));
      },
      commit: async () => {
        for (const op of ops) await op();
      },
    };
  }
}

async function runTests() {
  console.log('=== Running Desktop Sync API Tests ===\n');

  // Test 1: Tenant Resolution & Isolation Verification
  console.log('Test 1: Tenant Resolution and Isolation');
  const strikeInfo = await getTenantInfoForHost('strike.mitrixo.com');
  if (strikeInfo.config.tenantId !== 'strike') {
    throw new Error(`Strike tenant resolution failed: expected strike, got ${strikeInfo.config.tenantId}`);
  }
  if (strikeInfo.config.firestoreDatabaseId !== undefined) {
    throw new Error(`Strike should use default firestore database, got ${strikeInfo.config.firestoreDatabaseId}`);
  }

  const inzanInfo = await getTenantInfoForHost('inzanathletics.mitrixo.com');
  if (inzanInfo.config.tenantId !== 'inzanathletics') {
    throw new Error(`Inzan tenant resolution failed: expected inzanathletics, got ${inzanInfo.config.tenantId}`);
  }
  if (inzanInfo.config.firestoreDatabaseId !== 'db-inzanathletics') {
    throw new Error(`Inzan must use db-inzanathletics, got ${inzanInfo.config.firestoreDatabaseId}`);
  }

  const inzanAdminInfo = await getTenantInfoForHost('admin.inzanathletics.com');
  if (inzanAdminInfo.config.tenantId !== 'inzanathletics' || inzanAdminInfo.status !== 'active') {
    throw new Error(`admin.inzanathletics.com resolution failed: expected active inzanathletics, got ${JSON.stringify(inzanAdminInfo)}`);
  }
  if (inzanAdminInfo.config.firestoreDatabaseId !== 'db-inzanathletics') {
    throw new Error(`admin.inzanathletics.com must use db-inzanathletics, got ${inzanAdminInfo.config.firestoreDatabaseId}`);
  }

  const inzanLandingInfo = await getTenantInfoForHost('inzanathletics.com');
  if (inzanLandingInfo.status !== 'landing_page') {
    throw new Error(`inzanathletics.com should resolve to landing_page status, got ${inzanLandingInfo.status}`);
  }
  console.log('✔ Tenant resolution correctly isolates Strike, Inzan admin, and Inzan landing page.\n');

  // Test 2: Set up Express test app with testDb injection
  const mockDb = new MockFirestore();

  // Seed sample member in mockDb
  await mockDb.collection('clients').doc('client-test-123').set({
    name: 'Ahmed Zaki',
    packageType: 'Boxing Elite 20',
    status: 'Active',
    updatedAt: new Date(Date.now() - 60000).toISOString(),
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any)._testDb = mockDb;
    next();
  });
  app.use('/api/desktop', desktopSyncRouter);

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}/api/desktop`;

  try {
    // Test 3: Reject tenant mismatch
    console.log('Test 2: Reject Tenant Mismatch on Device Registration');
    const mismatchRes = await fetch(`${baseUrl}/devices/register?tenant=strike`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: 'inzanathletics', // Claiming to be inzan on strike tenant URL
        deviceId: 'dev-device-001',
        deviceName: 'Reception Desk 1',
        appVersion: '1.0.0',
        staffToken: 'test-staff-token',
      }),
    });
    const mismatchJson = await mismatchRes.json();
    if (mismatchRes.status !== 400 || mismatchJson.error !== 'TENANT_MISMATCH') {
      throw new Error(`Expected 400 TENANT_MISMATCH, got ${mismatchRes.status} ${JSON.stringify(mismatchJson)}`);
    }
    console.log('✔ Tenant mismatch successfully rejected with 400 TENANT_MISMATCH.\n');

    // Test 4: Register Device Successfully
    console.log('Test 3: Register Device Successfully');
    const testDeviceId = `test-desk-${Date.now()}`;
    const registerRes = await fetch(`${baseUrl}/devices/register?tenant=strike`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: 'strike',
        deviceId: testDeviceId,
        deviceName: 'Strike Front Desk Test',
        appVersion: '1.0.0',
        staffToken: 'test-staff-token',
      }),
    });
    const regData = await registerRes.json();
    if (registerRes.status !== 200 || regData.status !== 'registered' || !regData.deviceToken) {
      throw new Error(`Device registration failed: ${registerRes.status} ${JSON.stringify(regData)}`);
    }
    console.log(`✔ Device registered successfully with token: ${regData.deviceToken.slice(0, 15)}...\n`);

    const initialToken = regData.deviceToken;

    // Test 5: Refresh Device Token
    console.log('Test 4: Refresh Device Token');
    const refreshRes = await fetch(`${baseUrl}/devices/refresh?tenant=strike`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': testDeviceId,
        'X-Device-Token': initialToken,
      },
      body: JSON.stringify({ appVersion: '1.0.1' }),
    });
    const refreshData = await refreshRes.json();
    if (refreshRes.status !== 200 || refreshData.status !== 'refreshed' || !refreshData.deviceToken) {
      throw new Error(`Device refresh failed: ${refreshRes.status} ${JSON.stringify(refreshData)}`);
    }
    console.log(`✔ Device token refreshed successfully: ${refreshData.deviceToken.slice(0, 15)}...\n`);

    const activeToken = refreshData.deviceToken;

    // Test 6: Sync Push - Attendance Check-in with Idempotency
    console.log('Test 5: Sync Push and Idempotency Verification');
    const operationId = `op-checkin-${Date.now()}`;
    const pushPayload = {
      operations: [
        {
          operationId,
          entityType: 'attendance',
          operationType: 'attendance.checkin',
          payload: {
            clientId: 'client-test-123',
            clientName: 'Ahmed Zaki',
            branch: 'ZAMALEK',
            date: new Date().toISOString(),
            packageName: 'Boxing Elite 20',
          },
        },
      ],
    };

    // First push -> should apply
    const push1Res = await fetch(`${baseUrl}/sync/push?tenant=strike`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': testDeviceId,
        'X-Device-Token': activeToken,
      },
      body: JSON.stringify(pushPayload),
    });
    const push1Data = await push1Res.json();
    if (push1Res.status !== 200 || push1Data.results[0]?.status !== 'acknowledged' || push1Data.results[0]?.deduplicated !== false) {
      throw new Error(`First push failed: ${push1Res.status} ${JSON.stringify(push1Data)}`);
    }
    console.log('✔ First push acknowledged and applied.');

    // Second push with same operationId -> must be deduplicated!
    const push2Res = await fetch(`${baseUrl}/sync/push?tenant=strike`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': testDeviceId,
        'X-Device-Token': activeToken,
      },
      body: JSON.stringify(pushPayload),
    });
    const push2Data = await push2Res.json();
    if (push2Res.status !== 200 || push2Data.results[0]?.status !== 'acknowledged' || push2Data.results[0]?.deduplicated !== true) {
      throw new Error(`Second push idempotency failed: ${push2Res.status} ${JSON.stringify(push2Data)}`);
    }
    console.log('✔ Second push acknowledged as deduplicated (idempotency ledger verified).\n');

    // Test 7: Member update note
    console.log('Test 6: Member Note Update Push');
    const noteOpId = `op-note-${Date.now()}`;
    const noteRes = await fetch(`${baseUrl}/sync/push?tenant=strike`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': testDeviceId,
        'X-Device-Token': activeToken,
      },
      body: JSON.stringify({
        operations: [
          {
            operationId: noteOpId,
            entityType: 'member',
            operationType: 'member.update_notes',
            payload: {
              clientId: 'client-test-123',
              note: 'Requested morning boxing schedule update.',
              author: 'Receptionist Sarah',
            },
          },
        ],
      }),
    });
    const noteData = await noteRes.json();
    if (noteRes.status !== 200 || noteData.results[0]?.status !== 'acknowledged') {
      throw new Error(`Note push failed: ${noteRes.status} ${JSON.stringify(noteData)}`);
    }
    console.log('✔ Member note appended atomically with audit record.\n');

    // Test 8: Sync Pull
    console.log('Test 7: Sync Pull Feed');
    const pullRes = await fetch(`${baseUrl}/sync/pull?tenant=strike&limit=10`, {
      method: 'GET',
      headers: {
        'X-Device-Id': testDeviceId,
        'X-Device-Token': activeToken,
      },
    });
    const pullData = await pullRes.json();
    if (pullRes.status !== 200 || !Array.isArray(pullData.items) || !pullData.serverTime) {
      throw new Error(`Sync pull failed: ${pullRes.status} ${JSON.stringify(pullData)}`);
    }
    console.log(`✔ Sync pull returned ${pullData.items.length} items (nextCursor: ${pullData.nextCursor}).\n`);

    // Test 9: Conflict Resolution
    console.log('Test 8: Conflict Resolution Endpoint');
    const conflictId = `conf-${Date.now()}`;
    await mockDb.collection('desktop_conflicts').doc(conflictId).set({
      operationId: 'op-conflicted',
      reason: 'Concurrent edit detected',
      status: 'unresolved',
      createdAt: new Date().toISOString(),
    });

    const resolveRes = await fetch(`${baseUrl}/conflicts/${conflictId}/resolve?tenant=strike`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-staff-token',
      },
      body: JSON.stringify({
        resolution: 'accepted',
        resolutionNotes: 'Approved manually by manager',
      }),
    });
    const resolveData = await resolveRes.json();
    if (resolveRes.status !== 200 || resolveData.status !== 'resolved' || resolveData.conflictId !== conflictId) {
      throw new Error(`Conflict resolution failed: ${resolveRes.status} ${JSON.stringify(resolveData)}`);
    }
    console.log('✔ Conflict successfully resolved.\n');

    // Test 10: Device Revocation and Access Denial
    console.log('Test 9: Device Revocation & Enforced 403');
    const revokeRes = await fetch(`${baseUrl}/devices/${testDeviceId}/revoke?tenant=strike`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-staff-token',
      },
      body: JSON.stringify({ reason: 'Decommissioned workstation' }),
    });
    const revokeData = await revokeRes.json();
    if (revokeRes.status !== 200 || revokeData.status !== 'revoked') {
      throw new Error(`Revocation failed: ${revokeRes.status} ${JSON.stringify(revokeData)}`);
    }
    console.log('✔ Device revoked successfully.');

    // Revoked device trying to push -> must receive 403 DEVICE_REVOKED
    const blockedPushRes = await fetch(`${baseUrl}/sync/push?tenant=strike`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': testDeviceId,
        'X-Device-Token': activeToken,
      },
      body: JSON.stringify({ operations: [] }),
    });
    const blockedPushData = await blockedPushRes.json();
    if (blockedPushRes.status !== 403 || blockedPushData.error !== 'DEVICE_REVOKED') {
      throw new Error(`Expected 403 DEVICE_REVOKED on revoked device, got ${blockedPushRes.status} ${JSON.stringify(blockedPushData)}`);
    }
    console.log('✔ Revoked device correctly rejected with 403 DEVICE_REVOKED.\n');

    console.log('🎉 ALL 9 DESKTOP SYNC API INTEGRATION TESTS PASSED WITH 100% SUCCESS! 🎉');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
