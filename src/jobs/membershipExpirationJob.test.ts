import assert from 'assert';
import {
  toEndOfDayMs,
  getCalendarDaysDiff,
  getClientActiveExpiryDate,
  getEffectiveClientStatus,
  runMembershipExpirationScan
} from './membershipExpirationJob';
import { renderNotificationContent } from '../services/notificationEventService';

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
 * In-memory Mock Firestore for Expiration Scan Testing
 */
class MockAdminFirestore {
  public databaseId = 'db-inzanathletics';
  public collections: Map<string, Map<string, any>> = new Map();

  constructor() {
    this.collections.set('clients', new Map());
    this.collections.set('classBookings', new Map());
    this.collections.set('classSchedules', new Map());
    this.collections.set('membership_status_changes', new Map());
    this.collections.set('memberships', new Map());
    this.collections.set('notifications_log', new Map());
    this.collections.set('notificationDeliveryLogs', new Map());
    this.collections.set('notifications', new Map());
    this.collections.set('users', new Map());
  }

  collection(name: string) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    const store = this.collections.get(name)!;

    const createQuery = (filters: Array<{ field: string; op: string; val: any }> = [], limitVal?: number) => ({
      where: (field: string, op: string, val: any) => createQuery([...filters, { field, op, val }], limitVal),
      limit: (n: number) => createQuery(filters, n),
      get: async () => {
        let docs = Array.from(store.entries()).map(([id, data]) => ({
          id,
          data: () => ({ ...data }),
          ref: {
            update: async (updates: any) => {
              Object.assign(store.get(id), updates);
            }
          }
        }));

        for (const f of filters) {
          if (f.op === '==') {
            docs = docs.filter(d => d.data()[f.field] === f.val);
          } else if (f.op === 'in') {
            docs = docs.filter(d => Array.isArray(f.val) && f.val.includes(d.data()[f.field]));
          }
        }

        if (limitVal !== undefined) {
          docs = docs.slice(0, limitVal);
        }

        return {
          empty: docs.length === 0,
          docs
        };
      },
      add: async (data: any) => {
        const id = `doc_${Math.random().toString(36).substring(2, 9)}`;
        store.set(id, { ...data, id });
        return { id };
      },
      doc: (docId: string) => ({
        get: async () => {
          const data = store.get(docId);
          return {
            exists: !!data,
            id: docId,
            data: () => (data ? { ...data } : undefined)
          };
        },
        set: async (data: any) => {
          store.set(docId, { ...data, id: docId });
        },
        update: async (updates: any) => {
          const existing = store.get(docId) || {};
          store.set(docId, { ...existing, ...updates });
        }
      })
    });

    return createQuery();
  }
}

async function runTests() {
  console.log('Running Membership Expiration Job & Notification Automated Tests...\n');

  // Test 1: Notification copy verification
  await test('1. Notification copy matches exact requirements for expiring and expired events', () => {
    const expiring = renderNotificationContent('membership_expiring', {
      clientName: 'Omar Sherif',
      gymName: 'INZAN Athletics',
      daysRemaining: 7,
      expiryDate: '2026-11-05'
    });
    assert.strictEqual(expiring.title, 'Membership Expiring Soon');
    assert.strictEqual(
      expiring.body,
      'Hi Omar Sherif, your membership at INZAN Athletics will expire in 7 days on 2026-11-05. Renew now to keep your active schedule.'
    );

    const expired = renderNotificationContent('membership_expired', {
      clientName: 'Omar Sherif'
    });
    assert.strictEqual(expired.title, 'Membership Expired');
    assert.strictEqual(
      expired.body,
      'Hi Omar Sherif, your gym membership has expired. Renew online in the member app or visit reception to continue booking.'
    );
  });

  // Test 2: Calendar days difference calculation
  await test('2. getCalendarDaysDiff accurately computes 7, 3, 1 day differences across date formats', () => {
    const ref = new Date('2026-10-29T10:00:00.000Z');

    assert.strictEqual(getCalendarDaysDiff('2026-11-05', ref), 7);
    assert.strictEqual(getCalendarDaysDiff('2026-11-01', ref), 3);
    assert.strictEqual(getCalendarDaysDiff('2026-10-30', ref), 1);
    assert.strictEqual(getCalendarDaysDiff('2026-10-29', ref), 0);
    assert.strictEqual(getCalendarDaysDiff('2026-10-28', ref), -1);
  });

  // Test 3: Active expiry date extraction
  await test('3. getClientActiveExpiryDate resolves latest active package end date over expired ones', () => {
    const client = {
      status: 'Active',
      membershipExpiry: '2026-10-30',
      packages: [
        { name: 'Old Package', status: 'Expired', endDate: '2026-10-01' },
        { name: 'Active Package', status: 'Active', endDate: '2026-11-05' }
      ]
    };
    const activeExpiry = getClientActiveExpiryDate(client);
    assert.strictEqual(activeExpiry, '2026-11-05');
  });

  // Test 4: Expiration scan detects 7, 3, 1 days and marks expired
  await test('4. runMembershipExpirationScan dispatches notifications for 7d, 3d, 1d and expired members', async () => {
    const mockDb = new MockAdminFirestore();
    const refDate = new Date('2026-10-29T12:00:00.000Z');

    // Client 1: Expiring in 7 days (2026-11-05) with Expo push token
    mockDb.collections.get('clients')!.set('client_7d', {
      name: 'Ahmed 7-Days',
      status: 'Active',
      membershipExpiry: '2026-11-05',
      expoPushToken: 'ExponentPushToken[mock-token-7d]'
    });

    // Client 2: Expiring in 3 days (2026-11-01) with active package
    mockDb.collections.get('clients')!.set('client_3d', {
      name: 'Mona 3-Days',
      status: 'Active',
      packages: [
        { name: 'Kickboxing 10', status: 'Active', endDate: '2026-11-01', sessionsRemaining: 5 }
      ]
    });

    // Client 3: Expiring in 1 day (2026-10-30)
    mockDb.collections.get('clients')!.set('client_1d', {
      name: 'Tamer 1-Day',
      status: 'Active',
      membershipExpiry: '2026-10-30'
    });

    // Client 4: Expiring in 14 days (should NOT trigger notification)
    mockDb.collections.get('clients')!.set('client_14d', {
      name: 'Karim 14-Days',
      status: 'Active',
      membershipExpiry: '2026-11-12'
    });

    // Client 5: Already expired (2026-10-20)
    mockDb.collections.get('clients')!.set('client_expired', {
      name: 'Hassan Expired',
      status: 'Active',
      membershipExpiry: '2026-10-20',
      expoPushToken: 'ExponentPushToken[mock-token-expired]'
    });

    const res = await runMembershipExpirationScan(mockDb as any, {
      referenceDate: refDate
    });

    assert.strictEqual(res.scannedClients, 5);
    assert.strictEqual(res.expiredClients, 1);
    assert.strictEqual(res.expiringNotificationsSent, 3); // 7d, 3d, 1d
    assert.strictEqual(res.expiredNotificationsSent, 1);

    // Verify client_expired status updated in DB
    const expiredClient = mockDb.collections.get('clients')!.get('client_expired');
    assert.strictEqual(expiredClient.status, 'Expired');

    // Verify notifications_log recorded all 4 dispatched events
    const notifLogs = Array.from(mockDb.collections.get('notifications_log')!.values());
    assert.strictEqual(notifLogs.length, 4);

    const expiringLogs = notifLogs.filter(l => l.eventType === 'membership_expiring');
    assert.strictEqual(expiringLogs.length, 3);
    assert.ok(expiringLogs.some(l => l.clientId === 'client_7d' && l.daysRemaining === 7));
    assert.ok(expiringLogs.some(l => l.clientId === 'client_3d' && l.daysRemaining === 3));
    assert.ok(expiringLogs.some(l => l.clientId === 'client_1d' && l.daysRemaining === 1));

    const expiredLogs = notifLogs.filter(l => l.eventType === 'membership_expired');
    assert.strictEqual(expiredLogs.length, 1);
    assert.strictEqual(expiredLogs[0].clientId, 'client_expired');

    // Verify in-app notifications were created
    const inAppNotifs = Array.from(mockDb.collections.get('notifications')!.values());
    assert.strictEqual(inAppNotifs.length, 4);
    assert.ok(inAppNotifs.some(n => n.type === 'membership_expiring' && n.title === 'Membership Expiring Soon'));
    assert.ok(inAppNotifs.some(n => n.type === 'membership_expired' && n.title === 'Membership Expired'));
  });

  // Test 5: Idempotency deduplication check
  await test('5. Subsequent scan on the same day skips duplicate notifications', async () => {
    const mockDb = new MockAdminFirestore();
    const refDate = new Date('2026-10-29T12:00:00.000Z');

    mockDb.collections.get('clients')!.set('client_test', {
      name: 'Dedupe Member',
      status: 'Active',
      membershipExpiry: '2026-11-05' // 7 days
    });

    const firstRun = await runMembershipExpirationScan(mockDb as any, { referenceDate: refDate });
    assert.strictEqual(firstRun.expiringNotificationsSent, 1);

    // Run again on same day
    const secondRun = await runMembershipExpirationScan(mockDb as any, { referenceDate: refDate });
    assert.strictEqual(secondRun.expiringNotificationsSent, 0);

    // Only 1 log in notifications_log
    const logs = Array.from(mockDb.collections.get('notifications_log')!.values());
    assert.strictEqual(logs.length, 1);
  });

  console.log('All Membership Expiration Job & Notification Tests Passed! ✅\n');
}

runTests();
