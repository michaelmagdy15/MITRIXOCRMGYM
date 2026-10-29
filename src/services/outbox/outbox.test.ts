import assert from 'assert';
import type { OutboxEntry, OutboxOperationType, FlushResult } from './outboxTypes';
import {
  enqueueOperation,
  flushOutbox,
  getPendingOutboxCount,
  onOutboxChange,
  setActiveSyncContext,
} from './outboxProcessor';
import * as outboxDb from './outboxDb';

// In-memory mock for indexedDB in Node environment
class MockIndexedDBStore {
  private data = new Map<string, OutboxEntry>();

  async put(_store: string, val: OutboxEntry) {
    this.data.set(val.operationId, { ...val });
  }

  async get(_store: string, key: string) {
    const item = this.data.get(key);
    return item ? { ...item } : undefined;
  }

  async delete(_store: string, key: string) {
    this.data.delete(key);
  }

  async getAll(_store: string) {
    return Array.from(this.data.values()).map((v) => ({ ...v }));
  }

  async getAllFromIndex(_store: string, indexName: string, query: any) {
    return Array.from(this.data.values())
      .filter((item: any) => item[indexName] === query)
      .map((v) => ({ ...v }));
  }

  async clear(_store: string) {
    this.data.clear();
  }
}

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

async function runTests() {
  console.log('Running Outbox Queue & Sync Dispatcher unit tests...');

  // Setup mock for outboxDb in Node
  const mockStore = new MockIndexedDBStore();
  outboxDb.setCustomOutboxDb(mockStore);

  // Test 1: Verify types and structure
  await test('1. OutboxEntry structure satisfies all required fields', () => {
    const entry: OutboxEntry = {
      operationId: 'op-1234-uuid',
      tenantId: 'strike',
      operationType: 'attendance.checkin',
      entityId: 'client-100',
      payload: { memberId: '100', checkInTime: '2026-10-29T12:00:00Z' },
      status: 'pending',
      retryCount: 0,
      createdAtUtc: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString(),
    };

    assert.strictEqual(entry.operationId, 'op-1234-uuid');
    assert.strictEqual(entry.tenantId, 'strike');
    assert.strictEqual(entry.operationType, 'attendance.checkin');
    assert.strictEqual(entry.status, 'pending');
    assert.strictEqual(entry.retryCount, 0);
  });

  // Test 2: Enqueue operation generates unique UUID and commits entry
  await test('2. enqueueOperation creates persistent pending entry with valid UUID', async () => {
    await mockStore.clear('outbox');
    const opId = await enqueueOperation(
      'strike',
      'attendance.checkin',
      'member-42',
      { branch: 'heliopolis' }
    );

    assert.ok(opId && typeof opId === 'string');
    assert.match(opId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    const stored = await mockStore.get('outbox', opId);
    assert.ok(stored);
    assert.strictEqual(stored.operationId, opId);
    assert.strictEqual(stored.tenantId, 'strike');
    assert.strictEqual(stored.operationType, 'attendance.checkin');
    assert.strictEqual(stored.entityId, 'member-42');
    assert.strictEqual(stored.status, 'pending');
    assert.strictEqual(stored.retryCount, 0);
  });

  // Test 3: getPendingOutboxCount reports correct count
  await test('3. getPendingOutboxCount returns pending count for given tenant', async () => {
    await mockStore.clear('outbox');
    assert.strictEqual(await getPendingOutboxCount('strike'), 0);

    await enqueueOperation('strike', 'client.create', 'c-1', { name: 'Ali' });
    await enqueueOperation('strike', 'client.update', 'c-1', { name: 'Ali Hassan' });
    await enqueueOperation('inzanathletics', 'client.create', 'c-2', { name: 'Omar' });

    assert.strictEqual(await getPendingOutboxCount('strike'), 2);
    assert.strictEqual(await getPendingOutboxCount('inzanathletics'), 1);
  });

  // Test 4: onOutboxChange notification subscription
  await test('4. onOutboxChange notifies listeners of queue updates', async () => {
    await mockStore.clear('outbox');
    let notifiedCount: number | null = null;

    const unsubscribe = onOutboxChange((count) => {
      notifiedCount = count;
    }, 'strike');

    await enqueueOperation('strike', 'payment.create', 'pay-1', { amount: 500 });
    assert.strictEqual(notifiedCount, 1);

    unsubscribe();
    await enqueueOperation('strike', 'payment.create', 'pay-2', { amount: 300 });
    // After unsubscribe, notifiedCount shouldn't update to 2
    assert.strictEqual(notifiedCount, 1);
  });

  // Test 5: flushOutbox sends batch to /api/desktop/sync/push and handles acknowledgement
  await test('5. flushOutbox pushes batch to server and clears acknowledged entries', async () => {
    await mockStore.clear('outbox');
    const op1 = await enqueueOperation('strike', 'attendance.checkin', 'mem-1', {});
    const op2 = await enqueueOperation('strike', 'client.update', 'mem-2', { phone: '01012345678' });

    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    // Mock global fetch
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      capturedUrl = url;
      capturedHeaders = opts.headers;
      capturedBody = JSON.parse(opts.body);

      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            { operationId: op1, status: 'acknowledged' },
            { operationId: op2, status: 'acknowledged' },
          ],
        }),
      };
    };

    try {
      const result: FlushResult = await flushOutbox('strike', 'test-auth-token-xyz');

      assert.strictEqual(capturedUrl, '/api/desktop/sync/push');
      assert.strictEqual(capturedHeaders['x-tenant-id'], 'strike');
      assert.strictEqual(capturedHeaders['Authorization'], 'Bearer test-auth-token-xyz');
      assert.ok(Array.isArray(capturedBody.batch));
      assert.strictEqual(capturedBody.batch.length, 2);

      assert.strictEqual(result.sent, 2);
      assert.strictEqual(result.succeeded, 2);
      assert.strictEqual(result.failed, 0);

      // Acknowledged entries should be removed from outbox
      assert.strictEqual(await getPendingOutboxCount('strike'), 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // Test 6: flushOutbox increments retryCount and records lastError for failed entries
  await test('6. flushOutbox updates retryCount and lastError on rejection', async () => {
    await mockStore.clear('outbox');
    const opId = await enqueueOperation('strike', 'payment.create', 'p-99', { amount: 100 });

    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              operationId: opId,
              status: 'failed',
              error: 'INSUFFICIENT_FUNDS',
              reason: 'Payment processor declined transaction',
            },
          ],
        }),
      };
    };

    try {
      const result = await flushOutbox('strike');
      assert.strictEqual(result.sent, 1);
      assert.strictEqual(result.succeeded, 0);
      assert.strictEqual(result.failed, 1);

      const entry = await mockStore.get('outbox', opId);
      assert.ok(entry);
      assert.strictEqual(entry.status, 'failed');
      assert.strictEqual(entry.retryCount, 1);
      assert.strictEqual(entry.lastError, 'Payment processor declined transaction');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // Test 7: Network failure sets all batch items to failed with retryCount incremented
  await test('7. flushOutbox handles network drops gracefully without losing operations', async () => {
    await mockStore.clear('outbox');
    const opId = await enqueueOperation('strike', 'attendance.checkin', 'mem-5', {});

    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      throw new Error('Failed to fetch (offline)');
    };

    try {
      const result = await flushOutbox('strike');
      assert.strictEqual(result.sent, 1);
      assert.strictEqual(result.succeeded, 0);
      assert.strictEqual(result.failed, 1);

      const entry = await mockStore.get('outbox', opId);
      assert.ok(entry);
      assert.strictEqual(entry.status, 'failed');
      assert.strictEqual(entry.retryCount, 1);
      assert.match(entry.lastError || '', /offline/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  console.log('\nAll Outbox Queue & Sync Dispatcher tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
