import assert from 'assert';
import { startBackgroundSync, syncNow } from './syncManager';
import { setCustomLocalDb, getSyncCursor } from './localDb/gymLocalDb';
import { setCustomOutboxDb } from './outbox/outboxDb';
import { enqueueOperation } from './outbox/outboxProcessor';

// Mock in-memory database for gymLocalDb
class MockLocalDb {
  public stores: Record<string, Map<string, any>> = {
    members: new Map(),
    packages: new Map(),
    todayAttendance: new Map(),
    todaySchedule: new Map(),
    syncMeta: new Map(),
  };

  transaction(storeName: string, _mode: string) {
    const store = this.stores[storeName] || new Map();
    return {
      objectStore: (_name: string) => ({
        put: (item: any) => {
          const key = item.id || item.key;
          store.set(key, { ...item });
        },
        get: (key: string) => {
          return store.get(key);
        },
      }),
      done: Promise.resolve(),
    };
  }

  async put(storeName: string, item: any) {
    const store = this.stores[storeName];
    if (store) {
      const key = item.id || item.key;
      store.set(key, { ...item });
    }
  }

  async get(storeName: string, key: string) {
    const store = this.stores[storeName];
    return store ? store.get(key) : undefined;
  }

  async getAll(storeName: string) {
    const store = this.stores[storeName];
    return store ? Array.from(store.values()).map((v) => ({ ...v })) : [];
  }

  clearAll() {
    for (const map of Object.values(this.stores)) {
      map.clear();
    }
  }
}

// Mock in-memory store for outboxDb
class MockOutboxDbStore {
  private data = new Map<string, any>();

  async put(_store: string, val: any) {
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
  console.log('Running SyncManager background delta-sync unit tests...');

  const mockDb = new MockLocalDb();
  setCustomLocalDb(mockDb);

  const mockOutbox = new MockOutboxDbStore();
  setCustomOutboxDb(mockOutbox);

  // Helper to set navigator.onLine safely in Node environments
  const setOnLine = (online: boolean) => {
    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: online },
        configurable: true,
        writable: true,
      });
    } catch {
      try {
        Object.defineProperty(navigator, 'onLine', {
          value: online,
          configurable: true,
          writable: true,
        });
      } catch {
        // Fallback
      }
    }
  };

  const originalFetch = globalThis.fetch;

  try {
    // Test 1: Function exports
    await test('1. syncManager exports startBackgroundSync and syncNow functions', () => {
      assert.strictEqual(typeof startBackgroundSync, 'function');
      assert.strictEqual(typeof syncNow, 'function');
    });

    // Test 2: Pull and merge into local database
    await test('2. syncNow pulls delta items and persists members and packages', async () => {
      mockDb.clearAll();
      setOnLine(true);

      const serverTimeStr = '2026-10-29T12:00:00.000Z';
      let requestedUrl = '';
      let receivedTenantHeader = '';

      (globalThis as any).fetch = async (url: string, opts: any) => {
        requestedUrl = url;
        receivedTenantHeader = opts?.headers?.['x-tenant-id'];

        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: 'mem_1',
                entityType: 'member',
                data: { id: 'mem_1', name: 'Omar Boxing', phone: '01011112222', status: 'Active' },
              },
              {
                id: 'pkg_1',
                entityType: 'package',
                data: { id: 'pkg_1', name: 'Punch 12 Sessions', price: 1500 },
              },
            ],
            nextCursor: serverTimeStr,
            serverTime: serverTimeStr,
          }),
        };
      };

      const result = await syncNow('tenant-strike');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.pulled, 2);
      assert.strictEqual(receivedTenantHeader, 'tenant-strike');
      assert(requestedUrl.includes('/api/desktop/sync/pull?cursor=&limit=500'));

      // Verify member saved in localDb
      const member = mockDb.stores.members.get('mem_1');
      assert(member, 'Member mem_1 must be stored in localDb');
      assert.strictEqual(member.name, 'Omar Boxing');

      // Verify package saved in localDb
      const pkg = mockDb.stores.packages.get('pkg_1');
      assert(pkg, 'Package pkg_1 must be stored in localDb');
      assert.strictEqual(pkg.name, 'Punch 12 Sessions');

      // Verify cursor saved in localDb
      const savedCursor = await getSyncCursor('tenant-strike');
      assert.strictEqual(savedCursor, serverTimeStr);
    });

    // Test 3: Outbox flush integration with authorization token
    await test('3. syncNow flushes outbox operations and passes auth token', async () => {
      mockDb.clearAll();
      await mockOutbox.clear('outbox');
      setOnLine(true);

      // Enqueue an outbox operation
      await enqueueOperation('tenant-strike', 'attendance.checkin', 'att_123', {
        clientId: 'mem_1',
        sessionDate: '2026-10-29',
      });

      let pushHeaders: any = null;
      let pullHeaders: any = null;

      (globalThis as any).fetch = async (url: string, opts: any) => {
        if (url.includes('/api/desktop/sync/push')) {
          pushHeaders = opts?.headers;
          const body = JSON.parse(opts?.body || '{}');
          const batch = body?.batch || [];
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: batch.map((item: any) => ({
                operationId: item.operationId,
                status: 'acknowledged',
              })),
            }),
          };
        }
        if (url.includes('/api/desktop/sync/pull')) {
          pullHeaders = opts?.headers;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [],
              serverTime: '2026-10-29T12:05:00.000Z',
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      };

      const result = await syncNow('tenant-strike', async () => 'test-bearer-token');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.pushed, 1);
      assert.strictEqual(pushHeaders?.['Authorization'], 'Bearer test-bearer-token');
      assert.strictEqual(pushHeaders?.['x-tenant-id'], 'tenant-strike');
      assert.strictEqual(pullHeaders?.['Authorization'], 'Bearer test-bearer-token');
      assert.strictEqual(pullHeaders?.['x-tenant-id'], 'tenant-strike');
    });

    // Test 4: Offline skip resilience
    await test('4. syncNow gracefully skips without calling network when offline', async () => {
      setOnLine(false);
      let fetchCalled = false;

      (globalThis as any).fetch = async () => {
        fetchCalled = true;
        return { ok: true, status: 200, json: async () => ({ items: [] }) };
      };

      const result = await syncNow('tenant-strike');

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.pushed, 0);
      assert.strictEqual(result.pulled, 0);
      assert.strictEqual(fetchCalled, false, 'Fetch should not be called when offline');
    });

    // Test 5: Network dropout error resilience
    await test('5. syncNow catches network dropout errors silently without throwing', async () => {
      setOnLine(true);

      (globalThis as any).fetch = async () => {
        throw new Error('TypeError: Failed to fetch (network drop)');
      };

      const result = await syncNow('tenant-strike');

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.pulled, 0);
    });

    // Test 6: Server HTTP error resilience
    await test('6. syncNow handles 500 error gracefully', async () => {
      setOnLine(true);

      (globalThis as any).fetch = async () => {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: 'INTERNAL_ERROR' }),
        };
      };

      const result = await syncNow('tenant-strike');

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.pulled, 0);
    });

    // Test 7: startBackgroundSync timer, focus listener, and stopBackgroundSync cleanup
    await test('7. startBackgroundSync sets timer, registers focus listener, and cleans up properly', async () => {
      setOnLine(true);
      const eventListeners: Record<string, Function[]> = {};

      (globalThis as any).window = {
        addEventListener: (event: string, fn: Function) => {
          if (!eventListeners[event]) eventListeners[event] = [];
          eventListeners[event].push(fn);
        },
        removeEventListener: (event: string, fn: Function) => {
          if (!eventListeners[event]) return;
          eventListeners[event] = eventListeners[event].filter((f) => f !== fn);
        },
      };

      let fetchCount = 0;
      (globalThis as any).fetch = async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [], serverTime: '2026-10-29T12:10:00.000Z' }),
        };
      };

      // Start with small interval
      const stopSync = startBackgroundSync('tenant-strike', undefined, 50);

      // Verify focus listener was registered
      assert(eventListeners['focus'], 'focus listener should be registered');
      assert.strictEqual(eventListeners['focus'].length, 1);

      // Trigger focus listener manually
      const focusHandler = eventListeners['focus'][0];
      await focusHandler();
      assert(fetchCount >= 1, 'Sync should run on focus event');

      // Wait a moment for timer
      await new Promise((resolve) => setTimeout(resolve, 80));
      const countAfterTimer = fetchCount;
      assert(countAfterTimer > 1, 'Sync should run on timer interval');

      // Cleanup
      stopSync();

      // Verify listener was removed
      assert.strictEqual(eventListeners['focus'].length, 0, 'focus listener should be removed on cleanup');

      // Verify timer stopped (wait 70ms and verify fetchCount unchanged)
      const frozenCount = fetchCount;
      await new Promise((resolve) => setTimeout(resolve, 70));
      assert.strictEqual(fetchCount, frozenCount, 'No more syncs should run after cleanup');
    });

    console.log('\nAll SyncManager tests passed successfully!\n');
  } finally {
    // Restore globals
    globalThis.fetch = originalFetch;
    delete (globalThis as any).window;
    setOnLine(true);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
