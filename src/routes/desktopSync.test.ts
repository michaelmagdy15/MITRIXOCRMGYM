import assert from 'assert';
import express, { Request, Response } from 'express';
import { desktopSyncRouter } from './desktopSync.js';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

/**
 * In-memory Mock Firestore implementation tailored for desktopSync route testing
 */
class MockFirestore {
  private data: Map<string, Map<string, any>> = new Map();

  constructor() {}

  collection(collectionName: string) {
    if (!this.data.has(collectionName)) {
      this.data.set(collectionName, new Map());
    }
    const colMap = this.data.get(collectionName)!;

    return {
      doc: (docId?: string) => {
        const id = docId || `gen_${Math.random().toString(36).slice(2, 10)}`;
        return {
          id,
          get: async () => {
            const exists = colMap.has(id);
            const docData = exists ? JSON.parse(JSON.stringify(colMap.get(id))) : undefined;
            return {
              exists,
              id,
              data: () => docData,
            };
          },
          set: async (val: any, options?: { merge?: boolean }) => {
            if (options?.merge && colMap.has(id)) {
              colMap.set(id, { ...colMap.get(id), ...JSON.parse(JSON.stringify(val)) });
            } else {
              colMap.set(id, JSON.parse(JSON.stringify(val)));
            }
          },
          update: async (val: any) => {
            if (!colMap.has(id)) throw new Error(`Document ${id} not found in ${collectionName}`);
            colMap.set(id, { ...colMap.get(id), ...JSON.parse(JSON.stringify(val)) });
          },
        };
      },
      where: (field: string, op: string, val: any) => {
        return {
          orderBy: () => ({
            limit: (num: number) => ({
              get: async () => {
                const results: any[] = [];
                for (const [id, item] of colMap.entries()) {
                  if (op === '>' && item[field] > val) {
                    results.push({ id, data: () => JSON.parse(JSON.stringify(item)) });
                  }
                  if (results.length >= num) break;
                }
                return { docs: results };
              },
            }),
          }),
        };
      },
      orderBy: () => ({
        limit: (num: number) => ({
          get: async () => {
            const results: any[] = [];
            for (const [id, item] of colMap.entries()) {
              results.push({ id, data: () => JSON.parse(JSON.stringify(item)) });
              if (results.length >= num) break;
            }
            return { docs: results };
          },
        }),
      }),
      limit: (num: number) => ({
        get: async () => {
          const results: any[] = [];
          for (const [id, item] of colMap.entries()) {
            results.push({ id, data: () => JSON.parse(JSON.stringify(item)) });
            if (results.length >= num) break;
          }
          return { docs: results };
        },
      }),
      add: async (val: any) => {
        const id = `gen_${Math.random().toString(36).slice(2, 10)}`;
        colMap.set(id, JSON.parse(JSON.stringify(val)));
        return { id };
      },
    };
  }

  batch() {
    const operations: (() => void)[] = [];
    return {
      set: (docRef: any, data: any) => {
        operations.push(() => docRef.set(data));
      },
      update: (docRef: any, data: any) => {
        operations.push(() => docRef.update(data));
      },
      commit: async () => {
        for (const op of operations) {
          await op();
        }
      },
    };
  }

  getRawCollection(col: string) {
    if (!this.data.has(col)) this.data.set(col, new Map());
    return this.data.get(col)!;
  }
}

function dispatchRoute(router: any, req: any, res: any): Promise<void> {
  return new Promise((resolve) => {
    const origJson = res.json;
    res.json = (data: any) => {
      origJson(data);
      resolve();
      return res;
    };
    const origSend = res.send;
    res.send = (data: any) => {
      origSend(data);
      resolve();
      return res;
    };
    router.handle(req, res, () => {
      resolve();
    });
  });
}
function createMockReqRes(options: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, any>;
  db: MockFirestore;
}) {
  let statusCode = 200;
  let jsonResponse: any = null;

  const req: any = {
    method: options.method,
    url: options.url,
    headers: options.headers || {},
    get: (name: string) => (options.headers || {})[name.toLowerCase()] || (options.headers || {})[name],
    header: (name: string) => (options.headers || {})[name.toLowerCase()] || (options.headers || {})[name],
    body: options.body || {},
    query: options.query || {},
    _testDb: options.db,
  };

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (payload: any) => {
      jsonResponse = payload;
      return res;
    },
    send: (payload: any) => {
      jsonResponse = payload;
      return res;
    },
  };

  return {
    req,
    res,
    getStatus: () => statusCode,
    getJSON: () => jsonResponse,
  };
}

async function runTests() {
  console.log('--- Desktop & Web Front-Desk Sync Suite ---');

  process.env.NODE_ENV = 'test';

  await test('Web Front-Desk Client: staff auth token synthesizes virtual web device', async () => {
    const db = new MockFirestore();
    const app = express();
    app.use(express.json());
    app.use('/', desktopSyncRouter);

    const { req, res, getStatus, getJSON } = createMockReqRes({
      method: 'POST',
      url: '/sync/push',
      headers: {
        authorization: 'Bearer dev-staff-token',
        'x-app-version': 'web-1.0',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
      body: {
        operations: [],
      },
      db,
    });

    // Handle /sync/push directly via route handler
    await dispatchRoute(desktopSyncRouter, req, res);

    assert.strictEqual(getStatus(), 200);
    assert.deepStrictEqual(getJSON().results, []);
  });

  await test('Web Front-Desk Client: supports custom x-device-id with staff token', async () => {
    const db = new MockFirestore();
    const { req, res, getStatus, getJSON } = createMockReqRes({
      method: 'POST',
      url: '/sync/push',
      headers: {
        authorization: 'Bearer dev-staff-token',
        'x-device-id': 'reception-terminal-01',
      },
      body: {
        operations: [],
      },
      db,
    });

    await dispatchRoute(desktopSyncRouter, req, res);
    assert.strictEqual(getStatus(), 200);
  });

  await test('Hardware Client: validates registered desktop hardware device credentials', async () => {
    const db = new MockFirestore();
    const now = new Date().toISOString();
    // Pre-register hardware device in desktop_devices collection
    await db.collection('desktop_devices').doc('hw-device-123').set({
      deviceId: 'hw-device-123',
      deviceName: 'Windows Front Desk PC',
      appVersion: '1.0.0',
      tenantId: 'inzanathletics',
      deviceToken: 'token-abc-999',
      status: 'active',
      registeredAt: now,
      lastSeenAt: now,
    });

    const { req, res, getStatus } = createMockReqRes({
      method: 'POST',
      url: '/sync/push',
      headers: {
        'x-device-id': 'hw-device-123',
        'x-device-token': 'token-abc-999',
      },
      body: { operations: [] },
      db,
    });

    await dispatchRoute(desktopSyncRouter, req, res);
    assert.strictEqual(getStatus(), 200);
  });

  await test('Revoked Device: returns 403 DEVICE_REVOKED', async () => {
    const db = new MockFirestore();
    await db.collection('desktop_devices').doc('hw-revoked-01').set({
      deviceId: 'hw-revoked-01',
      deviceName: 'Stolen Tablet',
      deviceToken: 'bad-token',
      status: 'revoked',
    });

    const { req, res, getStatus, getJSON } = createMockReqRes({
      method: 'POST',
      url: '/sync/push',
      headers: {
        'x-device-id': 'hw-revoked-01',
        'x-device-token': 'bad-token',
      },
      body: { operations: [] },
      db,
    });

    await dispatchRoute(desktopSyncRouter, req, res);
    assert.strictEqual(getStatus(), 403);
    assert.strictEqual(getJSON().error, 'DEVICE_REVOKED');
  });

  await test('attendance.checkin: writes attendance and safely deducts sessionsRemaining and package credits', async () => {
    const db = new MockFirestore();
    // Seed client with 5 sessions and active package
    await db.collection('clients').doc('client-101').set({
      name: 'John Fighter',
      sessionsRemaining: 5,
      packageType: 'Boxing 10-Pack',
      packages: [
        {
          id: 'pkg-1',
          packageName: 'Boxing 10-Pack',
          status: 'Active',
          sessionsRemaining: 5,
          sessionsTotal: 10,
        },
      ],
    });

    const opId = 'op-checkin-uuid-001';
    const { req, res, getStatus, getJSON } = createMockReqRes({
      method: 'POST',
      url: '/sync/push',
      headers: {
        authorization: 'Bearer dev-staff-token',
      },
      body: {
        operations: [
          {
            operationId: opId,
            operationType: 'attendance.checkin',
            payload: {
              clientId: 'client-101',
              branch: 'MAIN',
              packageName: 'Boxing 10-Pack',
            },
          },
        ],
      },
      db,
    });

    await dispatchRoute(desktopSyncRouter, req, res);
    assert.strictEqual(getStatus(), 200);

    const json = getJSON();
    assert.strictEqual(json.results.length, 1);
    assert.strictEqual(json.results[0].status, 'acknowledged');
    assert.strictEqual(json.results[0].deduplicated, false);
    assert.strictEqual(json.results[0].result.clientUpdated, true);

    // Verify client sessionsRemaining decremented to 4
    const updatedClient = await db.collection('clients').doc('client-101').get();
    assert.strictEqual(updatedClient.data().sessionsRemaining, 4);
    assert.strictEqual(updatedClient.data().packages[0].sessionsRemaining, 4);

    // Verify attendance collection has entry with web_frontdesk source
    const attendanceRecords = Array.from(db.getRawCollection('attendance').values());
    assert.strictEqual(attendanceRecords.length, 1);
    assert.strictEqual(attendanceRecords[0].clientId, 'client-101');
    assert.strictEqual(attendanceRecords[0].source, 'web_frontdesk');
  });

  await test('Server Idempotency Ledger: prevents duplicate check-in on outbox retry', async () => {
    const db = new MockFirestore();
    await db.collection('clients').doc('client-202').set({
      name: 'Sarah Punch',
      sessionsRemaining: 3,
      packages: [
        {
          id: 'pkg-2',
          packageName: 'Strike 5',
          status: 'Active',
          sessionsRemaining: 3,
        },
      ],
    });

    const opId = 'op-retry-test-999';

    // First push
    const push1 = createMockReqRes({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: 'Bearer dev-staff-token' },
      body: {
        operations: [
          {
            operationId: opId,
            operationType: 'attendance.checkin',
            payload: { clientId: 'client-202' },
          },
        ],
      },
      db,
    });
    await dispatchRoute(desktopSyncRouter, push1.req, push1.res);
    assert.strictEqual(push1.getStatus(), 200);
    assert.strictEqual(push1.getJSON().results[0].deduplicated, false);

    // Verify sessions decremented once to 2
    let clientSnap = await db.collection('clients').doc('client-202').get();
    assert.strictEqual(clientSnap.data().sessionsRemaining, 2);

    // Retry outbox batch with exact same operationId (simulating WiFi reconnect / retry)
    const push2 = createMockReqRes({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: 'Bearer dev-staff-token' },
      body: {
        operations: [
          {
            operationId: opId,
            operationType: 'attendance.checkin',
            payload: { clientId: 'client-202' },
          },
        ],
      },
      db,
    });
    await dispatchRoute(desktopSyncRouter, push2.req, push2.res);
    assert.strictEqual(push2.getStatus(), 200);
    assert.strictEqual(push2.getJSON().results[0].status, 'acknowledged');
    assert.strictEqual(push2.getJSON().results[0].deduplicated, true);

    // Verify sessions NOT decremented again!
    clientSnap = await db.collection('clients').doc('client-202').get();
    assert.strictEqual(clientSnap.data().sessionsRemaining, 2);

    // Verify only 1 attendance document was created
    const attendanceRecords = Array.from(db.getRawCollection('attendance').values());
    assert.strictEqual(attendanceRecords.length, 1);
  });

  await test('GET /sync/pull: returns members and packages with stripped comments and bulky metadata', async () => {
    const db = new MockFirestore();
    const now = new Date().toISOString();

    // Seed client with bulky comments, interactions, and assignment history
    await db.collection('clients').doc('c-bulky').set({
      name: 'Heavy Member',
      phone: '01012345678',
      status: 'Active',
      updatedAt: now,
      comments: [{ text: 'Large comment thread', author: 'Staff' }],
      interactions: [{ type: 'Call', text: 'Call summary log' }],
      assignmentHistory: [{ transferredAt: '2026-01-01', from: 'repA', to: 'repB' }],
      documents: ['https://storage.fake/contract.pdf'],
    });

    // Seed package catalogue
    await db.collection('packages').doc('pkg-gold').set({
      name: 'Gold Membership',
      price: 1500,
      sessions: 30,
      status: 'Active',
      updatedAt: now,
      history: ['v1', 'v2'],
      auditTrail: [{ changed: 'price', from: 1200, to: 1500 }],
    });

    const { req, res, getStatus, getJSON } = createMockReqRes({
      method: 'GET',
      url: '/sync/pull',
      headers: { authorization: 'Bearer dev-staff-token' },
      db,
    });

    await dispatchRoute(desktopSyncRouter, req, res);
    assert.strictEqual(getStatus(), 200);

    const json = getJSON();
    assert.ok(Array.isArray(json.items));
    assert.strictEqual(json.items.length, 2);

    const memberItem = json.items.find((i: any) => i.entityType === 'member');
    assert.ok(memberItem, 'Member item should be returned in sync feed');
    assert.strictEqual(memberItem.data.name, 'Heavy Member');
    assert.strictEqual(memberItem.data.comments, undefined, 'Comments should be stripped');
    assert.strictEqual(memberItem.data.interactions, undefined, 'Interactions should be stripped');
    assert.strictEqual(memberItem.data.assignmentHistory, undefined, 'Assignment history should be stripped');
    assert.strictEqual(memberItem.data.documents, undefined, 'Documents should be stripped');

    const packageItem = json.items.find((i: any) => i.entityType === 'package');
    assert.ok(packageItem, 'Package item should be returned in sync feed');
    assert.strictEqual(packageItem.data.name, 'Gold Membership');
    assert.strictEqual(packageItem.data.history, undefined, 'Package history should be stripped');
    assert.strictEqual(packageItem.data.auditTrail, undefined, 'Package auditTrail should be stripped');
  });

  await test('payment.create: writes payment doc and updates client balance & payments list', async () => {
    const db = new MockFirestore();
    const clientId = 'client-pay-101';
    await db.collection('clients').doc(clientId).set({
      name: 'John Fighter',
      outstandingBalance: 1500,
      payments: ['old-pay-1'],
      packages: [
        {
          id: 'pkg-1',
          packageName: 'Pro Boxing 20',
          remainingBalance: 1500,
          paid: false,
        },
      ],
    });

    const opId = 'op-payment-101';
    const { req, res, getStatus, getJSON } = createMockReqRes({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: 'Bearer dev-staff-token' },
      body: {
        operations: [
          {
            operationId: opId,
            operationType: 'payment.create',
            payload: {
              clientId,
              amount: 500,
              paymentMethod: 'Credit Card',
              packageType: 'Boxing',
              packageName: 'Pro Boxing 20',
              notes: 'First installment',
              date: '2026-10-29T10:00:00.000Z',
              receiptNumber: 'REC-9001',
            },
          },
        ],
      },
      db,
    });

    await dispatchRoute(desktopSyncRouter, req, res);
    assert.strictEqual(getStatus(), 200);

    const json = getJSON();
    assert.strictEqual(json.results[0].status, 'acknowledged');
    assert.strictEqual(json.results[0].deduplicated, false);
    assert.strictEqual(json.results[0].result.amount, 500);

    // Verify payments collection doc created
    const payments = Array.from(db.getRawCollection('payments').values());
    assert.strictEqual(payments.length, 1);
    const p = payments[0];
    assert.strictEqual(p.clientId, clientId);
    assert.strictEqual(p.amount, 500);
    assert.strictEqual(p.paymentMethod, 'Credit Card');
    assert.strictEqual(p.packageType, 'Boxing');
    assert.strictEqual(p.packageName, 'Pro Boxing 20');
    assert.strictEqual(p.notes, 'First installment');
    assert.strictEqual(p.receiptNumber, 'REC-9001');
    assert.strictEqual(p.operationId, opId);

    // Verify client balance and payments list updated
    const clientSnap = await db.collection('clients').doc(clientId).get();
    const updatedClient = clientSnap.data();
    assert.strictEqual(updatedClient.outstandingBalance, 1000);
    assert.strictEqual(updatedClient.hasOutstandingBalance, true);
    assert.strictEqual(updatedClient.packages[0].remainingBalance, 1000);
    assert.strictEqual(updatedClient.payments.length, 2);
    assert.strictEqual(updatedClient.payments[0], 'old-pay-1');
    assert.strictEqual(updatedClient.payments[1], p.id);

    // Verify idempotency ledger entry exists
    const ledgerSnap = await db.collection('desktop_idempotency_ledger').doc(opId).get();
    assert.strictEqual(ledgerSnap.exists, true);
  });

  await test('payment.create: guest payment records payment without client lookup failure', async () => {
    const db = new MockFirestore();
    const opId = 'op-payment-guest-001';

    const { req, res, getStatus, getJSON } = createMockReqRes({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: 'Bearer dev-staff-token' },
      body: {
        operations: [
          {
            operationId: opId,
            operationType: 'payment.create',
            payload: {
              clientId: 'guest',
              guestName: 'Walk-in Alex',
              amount: 150,
              paymentMethod: 'Cash',
              packageType: 'Drop-in',
              packageName: 'Single Session',
              notes: 'Drop-in guest payment',
              date: '2026-10-29T11:00:00.000Z',
              receiptNumber: 'REC-GUEST-1',
            },
          },
        ],
      },
      db,
    });

    await dispatchRoute(desktopSyncRouter, req, res);
    assert.strictEqual(getStatus(), 200);

    const json = getJSON();
    assert.strictEqual(json.results[0].status, 'acknowledged');

    const payments = Array.from(db.getRawCollection('payments').values());
    assert.strictEqual(payments.length, 1);
    assert.strictEqual(payments[0].clientId, 'guest');
    assert.strictEqual(payments[0].clientName, 'Walk-in Alex');
    assert.strictEqual(payments[0].amount, 150);
  });

  await test('payment.create: server idempotency ledger prevents duplicate payment on retry', async () => {
    const db = new MockFirestore();
    const clientId = 'client-pay-202';
    await db.collection('clients').doc(clientId).set({
      name: 'Maria Strike',
      outstandingBalance: 1000,
      payments: [],
    });

    const opId = 'op-payment-retry-test';
    const payload = {
      clientId,
      amount: 400,
      paymentMethod: 'InstaPay',
      packageType: 'PT',
      packageName: 'PT 10',
      notes: 'InstaPay transfer',
      date: '2026-10-29T12:00:00.000Z',
      receiptNumber: 'REC-IPN-202',
    };

    // First push
    const push1 = createMockReqRes({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: 'Bearer dev-staff-token' },
      body: {
        operations: [
          {
            operationId: opId,
            operationType: 'payment.create',
            payload,
          },
        ],
      },
      db,
    });
    await dispatchRoute(desktopSyncRouter, push1.req, push1.res);
    assert.strictEqual(push1.getStatus(), 200);
    assert.strictEqual(push1.getJSON().results[0].deduplicated, false);

    let clientSnap = await db.collection('clients').doc(clientId).get();
    assert.strictEqual(clientSnap.data().outstandingBalance, 600);
    assert.strictEqual(clientSnap.data().payments.length, 1);

    // Second push (retry with same operationId)
    const push2 = createMockReqRes({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: 'Bearer dev-staff-token' },
      body: {
        operations: [
          {
            operationId: opId,
            operationType: 'payment.create',
            payload,
          },
        ],
      },
      db,
    });
    await dispatchRoute(desktopSyncRouter, push2.req, push2.res);
    assert.strictEqual(push2.getStatus(), 200);
    assert.strictEqual(push2.getJSON().results[0].status, 'acknowledged');
    assert.strictEqual(push2.getJSON().results[0].deduplicated, true);

    // Verify balance was NOT deducted a second time!
    clientSnap = await db.collection('clients').doc(clientId).get();
    assert.strictEqual(clientSnap.data().outstandingBalance, 600);
    assert.strictEqual(clientSnap.data().payments.length, 1);

    // Verify only 1 payment was created
    const payments = Array.from(db.getRawCollection('payments').values());
    assert.strictEqual(payments.length, 1);
  });

  console.log('All desktopSync tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
