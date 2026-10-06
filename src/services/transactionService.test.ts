import assert from 'assert';
import { calculatePricing } from '../utils/pricing';
import { buildEntitlementPayload } from './entitlementService';
import { Package, Payment } from '../types';

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
 * In-memory Transaction & Concurrency Simulator
 * Models the atomic Firestore transaction and lock behavior in transactionService.ts
 */
class TransactionSimulator {
  public payments = new Map<string, any>();
  public entitlements = new Map<string, any>();
  public clients = new Map<string, any>();
  public operationLocks = new Map<string, any>();
  public pointsWallets = new Map<string, any>();
  public auditLogs: any[] = [];
  public notifications: any[] = [];

  private _transactionQueue: Promise<any> = Promise.resolve();

  constructor() {}

  async runTransaction(
    updateFn: (txn: {
      get: (collection: string, id: string) => any;
      set: (collection: string, id: string, data: any) => void;
      update: (collection: string, id: string, data: any) => void;
    }) => Promise<void>
  ) {
    const run = async () => {
      // Stage mutations
      const staging = {
        sets: [] as { collection: string; id: string; data: any }[],
        updates: [] as { collection: string; id: string; data: any }[]
      };

      const txn = {
        get: (collection: string, id: string) => {
          if (collection === 'operationLocks') return this.operationLocks.get(id);
          if (collection === 'clients') return this.clients.get(id);
          if (collection === 'pointsWallets') return this.pointsWallets.get(id);
          if (collection === 'payments') return this.payments.get(id);
          if (collection === 'entitlements') return this.entitlements.get(id);
          return undefined;
        },
        set: (collection: string, id: string, data: any) => {
          staging.sets.push({ collection, id, data: JSON.parse(JSON.stringify(data)) });
        },
        update: (collection: string, id: string, data: any) => {
          staging.updates.push({ collection, id, data: JSON.parse(JSON.stringify(data)) });
        }
      };

      await updateFn(txn);

      // Commit staging atomically
      for (const s of staging.sets) {
        if (s.collection === 'operationLocks') this.operationLocks.set(s.id, s.data);
        if (s.collection === 'payments') this.payments.set(s.id, s.data);
        if (s.collection === 'entitlements') this.entitlements.set(s.id, s.data);
        if (s.collection === 'pointsWallets') this.pointsWallets.set(s.id, s.data);
      }
      for (const u of staging.updates) {
        if (u.collection === 'clients') {
          const existing = this.clients.get(u.id) || {};
          this.clients.set(u.id, { ...existing, ...u.data });
        }
        if (u.collection === 'pointsWallets') {
          const existing = this.pointsWallets.get(u.id) || {};
          this.pointsWallets.set(u.id, { ...existing, ...u.data });
        }
        if (u.collection === 'payments') {
          const existing = this.payments.get(u.id) || {};
          this.payments.set(u.id, { ...existing, ...u.data });
        }
        if (u.collection === 'entitlements') {
          const existing = this.entitlements.get(u.id) || {};
          this.entitlements.set(u.id, { ...existing, ...u.data });
        }
      }
    };

    const next = this._transactionQueue.then(run, run);
    this._transactionQueue = next;
    return next;
  }

  /** Simulates processPaymentTransaction logic adhering to Workstream B requirements */
  async executePaymentTransaction(params: {
    clientId: string;
    clientName: string;
    amount: number;
    amountPaid?: number;
    paymentStatus?: 'paid' | 'pending' | 'failed';
    operationId?: string;
    systemPackage?: Package;
    packageType: string;
    isRenewal?: boolean;
    isUpgradePayment?: boolean;
    previousPackageName?: string;
    discountType?: 'percentage' | 'amount';
    discountValue?: number;
    failOnEntitlement?: boolean;
    failOnNotification?: boolean;
  }) {
    const actualAmountPaid = params.amountPaid !== undefined ? params.amountPaid : params.amount;
    const isPendingOrFailed = params.paymentStatus === 'pending' || params.paymentStatus === 'failed';
    const remainingBalance = Math.max(0, params.amount - actualAmountPaid);
    const pointsEarned = isPendingOrFailed ? 0 : Math.floor(actualAmountPaid / 100);

    await this.runTransaction(async (txn) => {
      // 1. Lock check
      if (params.operationId) {
        const existingLock = txn.get('operationLocks', params.operationId);
        if (existingLock) {
          // Already processed; skip duplicate execution
          return;
        }
      }

      // 2. Client verification
      const client = txn.get('clients', params.clientId);
      if (!client) throw new Error('Client not found');

      // 3. Duplicate active package check
      const clientPkgs = client.packages || [];
      if (!params.isRenewal && !params.isUpgradePayment) {
        const hasActive = clientPkgs.some((p: any) => p.status === 'Active' && p.packageName === params.packageType);
        if (hasActive) {
          throw new Error('Active package already exists');
        }
      }

      // 4. Staged writes
      const paymentId = `pay_${Math.random().toString(36).substring(2, 9)}`;
      const entitlementId = `ent_${Math.random().toString(36).substring(2, 9)}`;

      if (params.operationId) {
        txn.set('operationLocks', params.operationId, {
          operationId: params.operationId,
          clientId: params.clientId,
          status: 'COMMITTED'
        });
      }

      txn.set('payments', paymentId, {
        id: paymentId,
        clientId: params.clientId,
        clientName: params.clientName,
        packageType: params.packageType,
        amount: params.amount,
        amount_paid: actualAmountPaid,
        remainingBalance,
        isPartialPayment: remainingBalance > 0,
        isComplimentary: params.amount === 0 && actualAmountPaid === 0,
        status: params.paymentStatus || 'paid',
        operationId: params.operationId,
        linkedEntitlementId: (!isPendingOrFailed && params.systemPackage) ? entitlementId : undefined
      });

      // Atomic failure simulation: if entitlement creation fails, the transaction rolls back
      if (params.failOnEntitlement) {
        throw new Error('Entitlement creation fatal error');
      }

      // 5. Entitlement creation ONLY for completed/paid
      if (!isPendingOrFailed && params.systemPackage) {
        const entitlement = buildEntitlementPayload(
          entitlementId,
          params.clientId,
          params.systemPackage,
          paymentId,
          new Date().toISOString(),
          new Date(Date.now() + 30 * 86400000).toISOString(),
          'active'
        );
        txn.set('entitlements', entitlementId, entitlement);
      }

      // 6. Client package updates
      if (!isPendingOrFailed) {
        const updatedPkgs = clientPkgs.map((p: any) => {
          if (p.status !== 'Active') return p;
          if (params.isRenewal && p.packageName === params.packageType) return { ...p, status: 'Expired' };
          if (params.isUpgradePayment && p.packageName === params.previousPackageName) return { ...p, status: 'Expired' };
          return p;
        });

        const newPkg = {
          id: `pkg_${Math.random().toString(36).substring(2, 9)}`,
          packageName: params.packageType,
          status: 'Active',
          amount: params.amount,
          amountPaid: actualAmountPaid,
          remainingBalance,
          isPartial: remainingBalance > 0,
          sessionsRemaining: params.systemPackage?.sessions || 0
        };

        const clientUpdate: any = {
          status: 'Active',
          packages: [...updatedPkgs, newPkg],
          sessionsRemaining: params.systemPackage?.sessions || 0
        };
        if (remainingBalance > 0) {
          clientUpdate.hasOutstandingBalance = true;
          clientUpdate.outstandingBalance = (client.outstandingBalance || 0) + remainingBalance;
        }

        // Points
        if (pointsEarned > 0) {
          const wallet = txn.get('pointsWallets', params.clientId) || { balance: 0, totalEarned: 0 };
          txn.set('pointsWallets', params.clientId, {
            balance: wallet.balance + pointsEarned,
            totalEarned: wallet.totalEarned + pointsEarned
          });
          clientUpdate.points = (client.points || 0) + pointsEarned;
        }

        txn.update('clients', params.clientId, clientUpdate);
      } else {
        txn.update('clients', params.clientId, {
          hasPendingPayment: true,
          lastPendingPaymentId: paymentId
        });
      }
    });

    // Secondary notification execution (outside atomic financial transaction)
    try {
      if (params.failOnNotification) {
        throw new Error('Push notification gateway 503');
      }
      this.notifications.push({ clientId: params.clientId, text: `Purchase confirmed: ${params.packageType}` });
    } catch (notifErr) {
      // PRD invariant: A secondary notification failure must NOT cause staff to re-charge or roll back financial state
      console.warn('Notification delivery failed (non-fatal):', notifErr);
    }
  }

  /** Simulates refund approval side-effect */
  async refundPayment(paymentId: string) {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error('Payment not found');

    payment.status = 'refunded';
    payment.refundedAt = new Date().toISOString();
    this.payments.set(paymentId, payment);

    if (payment.linkedEntitlementId) {
      const ent = this.entitlements.get(payment.linkedEntitlementId);
      if (ent) {
        ent.status = 'revoked';
        this.entitlements.set(payment.linkedEntitlementId, ent);
      }
    }

    const client = this.clients.get(payment.clientId);
    if (client && client.packages) {
      client.packages = client.packages.map((p: any) =>
        p.packageName === payment.packageType ? { ...p, status: 'Refunded' } : p
      );
      this.clients.set(payment.clientId, client);
    }
  }
}

async function runTests() {
  console.log('Running Payment & Entitlement Integrity tests (Workstream B)...');

  const samplePackage: Package = {
    id: 'pkg-boxing-12',
    name: 'Boxing 12 Sessions',
    price: 3000,
    sessions: 12,
    expiryDays: 45,
    branch: 'ALL',
    type: 'Group'
  };

  // Test 1: Full Payment
  await test('1. Full payment creates payment, active entitlement, and client package', async () => {
    const sim = new TransactionSimulator();
    sim.clients.set('c1', { id: 'c1', name: 'Karim Ali', status: 'Lead', packages: [] });

    await sim.executePaymentTransaction({
      clientId: 'c1',
      clientName: 'Karim Ali',
      amount: 3000,
      amountPaid: 3000,
      operationId: 'op_full_1',
      systemPackage: samplePackage,
      packageType: samplePackage.name
    });

    assert.strictEqual(sim.payments.size, 1);
    const pay = Array.from(sim.payments.values())[0];
    assert.strictEqual(pay.amount, 3000);
    assert.strictEqual(pay.amount_paid, 3000);
    assert.strictEqual(pay.remainingBalance, 0);
    assert.strictEqual(pay.status, 'paid');

    assert.strictEqual(sim.entitlements.size, 1);
    const ent = Array.from(sim.entitlements.values())[0];
    assert.strictEqual(ent.status, 'active');
    assert.strictEqual(ent.sessionsTotal, 12);
    assert.strictEqual(ent.sessionsUsed, 0);

    const client = sim.clients.get('c1');
    assert.strictEqual(client.status, 'Active');
    assert.strictEqual(client.packages.length, 1);
    assert.strictEqual(client.packages[0].status, 'Active');
    assert.strictEqual(client.points, 30); // 3000 / 100 = 30 points
  });

  // Test 2: Partial Payment
  await test('2. Partial payment preserves remaining balance without granting false full credit', async () => {
    const sim = new TransactionSimulator();
    sim.clients.set('c2', { id: 'c2', name: 'Omar Samir', status: 'Active', packages: [] });

    await sim.executePaymentTransaction({
      clientId: 'c2',
      clientName: 'Omar Samir',
      amount: 3000,
      amountPaid: 1000,
      operationId: 'op_part_1',
      systemPackage: samplePackage,
      packageType: samplePackage.name
    });

    const pay = Array.from(sim.payments.values())[0];
    assert.strictEqual(pay.amount, 3000);
    assert.strictEqual(pay.amount_paid, 1000);
    assert.strictEqual(pay.remainingBalance, 2000);
    assert.strictEqual(pay.isPartialPayment, true);

    const client = sim.clients.get('c2');
    assert.strictEqual(client.hasOutstandingBalance, true);
    assert.strictEqual(client.outstandingBalance, 2000);
    assert.strictEqual(client.packages[0].remainingBalance, 2000);
    assert.strictEqual(client.points, 10); // Points earned only on the 1000 LE collected!
  });

  // Test 3: Pending Payment
  await test('3. Pending payment records intent but does NOT activate package or entitlement', async () => {
    const sim = new TransactionSimulator();
    sim.clients.set('c3', { id: 'c3', name: 'Layla Hassan', status: 'Lead', packages: [] });

    await sim.executePaymentTransaction({
      clientId: 'c3',
      clientName: 'Layla Hassan',
      amount: 3000,
      amountPaid: 3000,
      paymentStatus: 'pending',
      operationId: 'op_pend_1',
      systemPackage: samplePackage,
      packageType: samplePackage.name
    });

    const pay = Array.from(sim.payments.values())[0];
    assert.strictEqual(pay.status, 'pending');

    // Entitlement must NOT exist
    assert.strictEqual(sim.entitlements.size, 0);

    // Client package must NOT be activated
    const client = sim.clients.get('c3');
    assert.strictEqual(client.status, 'Lead'); // Status unchanged
    assert.strictEqual(client.packages.length, 0); // No package active
    assert.strictEqual(client.hasPendingPayment, true);
    assert.strictEqual(client.points, undefined); // 0 points awarded
  });

  // Test 4: Complimentary / Free Package
  await test('4. Complimentary/free package activates access with 0 points and 0 balance', async () => {
    const sim = new TransactionSimulator();
    sim.clients.set('c4', { id: 'c4', name: 'Guest VIP', status: 'Lead', packages: [] });

    await sim.executePaymentTransaction({
      clientId: 'c4',
      clientName: 'Guest VIP',
      amount: 0,
      amountPaid: 0,
      operationId: 'op_free_1',
      systemPackage: samplePackage,
      packageType: samplePackage.name
    });

    const pay = Array.from(sim.payments.values())[0];
    assert.strictEqual(pay.isComplimentary, true);
    assert.strictEqual(pay.amount, 0);
    assert.strictEqual(pay.amount_paid, 0);

    const ent = Array.from(sim.entitlements.values())[0];
    assert.strictEqual(ent.status, 'active');

    const client = sim.clients.get('c4');
    assert.strictEqual(client.status, 'Active');
    assert.strictEqual(client.points, undefined); // 0 points
  });

  // Test 5: Discounts (Percentage & Fixed Amount)
  await test('5. Discounts accurately reduce amount due', () => {
    const p1 = calculatePricing({ grossAmount: 2000, discountType: 'percentage', discountValue: 20 });
    assert.strictEqual(p1.discountAmount, 400);
    assert.strictEqual(p1.netAmount, 1600);

    const p2 = calculatePricing({ grossAmount: 2000, discountType: 'amount', discountValue: 350 });
    assert.strictEqual(p2.discountAmount, 350);
    assert.strictEqual(p2.netAmount, 1650);
  });

  // Test 6: Package Renewal
  await test('6. Renewal expires previous package of same type and sets new active package', async () => {
    const sim = new TransactionSimulator();
    sim.clients.set('c6', {
      id: 'c6',
      name: 'Tamer Hosny',
      status: 'Active',
      packages: [{ id: 'old_pkg', packageName: samplePackage.name, status: 'Active', sessionsRemaining: 1 }]
    });

    await sim.executePaymentTransaction({
      clientId: 'c6',
      clientName: 'Tamer Hosny',
      amount: 3000,
      amountPaid: 3000,
      isRenewal: true,
      operationId: 'op_renew_1',
      systemPackage: samplePackage,
      packageType: samplePackage.name
    });

    const client = sim.clients.get('c6');
    assert.strictEqual(client.packages.length, 2);
    assert.strictEqual(client.packages[0].status, 'Expired');
    assert.strictEqual(client.packages[1].status, 'Active');
    assert.strictEqual(client.packages[1].sessionsRemaining, 12);
  });

  // Test 7: Package Upgrade
  await test('7. Upgrade expires previous package and activates new tier', async () => {
    const sim = new TransactionSimulator();
    sim.clients.set('c7', {
      id: 'c7',
      name: 'Youssef Sherif',
      status: 'Active',
      packages: [{ id: 'pkg_basic', packageName: 'Basic Boxing', status: 'Active', sessionsRemaining: 2 }]
    });

    await sim.executePaymentTransaction({
      clientId: 'c7',
      clientName: 'Youssef Sherif',
      amount: 4500,
      amountPaid: 4500,
      isUpgradePayment: true,
      previousPackageName: 'Basic Boxing',
      operationId: 'op_upg_1',
      systemPackage: { ...samplePackage, name: 'Pro Boxing', price: 4500 },
      packageType: 'Pro Boxing'
    });

    const client = sim.clients.get('c7');
    assert.strictEqual(client.packages[0].status, 'Expired');
    assert.strictEqual(client.packages[1].status, 'Active');
    assert.strictEqual(client.packages[1].packageName, 'Pro Boxing');
  });

  // Test 8: Duplicate Simultaneous Submit (Concurrency Collision)
  await test('8. Duplicate simultaneous submits with same operationId execute exactly once', async () => {
    const sim = new TransactionSimulator();
    sim.clients.set('c8', { id: 'c8', name: 'Nour El-Din', status: 'Lead', packages: [] });

    const opId = 'op_collision_123';
    // Run two submits concurrently
    await Promise.all([
      sim.executePaymentTransaction({
        clientId: 'c8',
        clientName: 'Nour El-Din',
        amount: 3000,
        amountPaid: 3000,
        operationId: opId,
        systemPackage: samplePackage,
        packageType: samplePackage.name
      }),
      sim.executePaymentTransaction({
        clientId: 'c8',
        clientName: 'Nour El-Din',
        amount: 3000,
        amountPaid: 3000,
        operationId: opId,
        systemPackage: samplePackage,
        packageType: samplePackage.name
      })
    ]);

    // Exactly one payment and one entitlement must be created
    assert.strictEqual(sim.payments.size, 1);
    assert.strictEqual(sim.entitlements.size, 1);
    assert.strictEqual(sim.clients.get('c8').packages.length, 1);
    assert.strictEqual(sim.clients.get('c8').points, 30);
  });

  // Test 9: Retry After Lost Response
  await test('9. Retry after network drop is safely idempotent (no-op)', async () => {
    const sim = new TransactionSimulator();
    sim.clients.set('c9', { id: 'c9', name: 'Mona Zaki', status: 'Lead', packages: [] });

    const opId = 'op_retry_lost_ack';
    await sim.executePaymentTransaction({
      clientId: 'c9',
      clientName: 'Mona Zaki',
      amount: 3000,
      amountPaid: 3000,
      operationId: opId,
      systemPackage: samplePackage,
      packageType: samplePackage.name
    });

    // Client retries submission because client app timed out waiting for ACK
    await sim.executePaymentTransaction({
      clientId: 'c9',
      clientName: 'Mona Zaki',
      amount: 3000,
      amountPaid: 3000,
      operationId: opId,
      systemPackage: samplePackage,
      packageType: samplePackage.name
    });

    assert.strictEqual(sim.payments.size, 1);
    assert.strictEqual(sim.entitlements.size, 1);
  });

  // Test 10: Failed Entitlement Creation (Transaction Rollback)
  await test('10. Fatal entitlement error rolls back payment and preserves clean state', async () => {
    const sim = new TransactionSimulator();
    sim.clients.set('c10', { id: 'c10', name: 'Amr Diab', status: 'Lead', packages: [] });

    let errCaught = false;
    try {
      await sim.executePaymentTransaction({
        clientId: 'c10',
        clientName: 'Amr Diab',
        amount: 3000,
        amountPaid: 3000,
        operationId: 'op_fail_ent',
        systemPackage: samplePackage,
        packageType: samplePackage.name,
        failOnEntitlement: true
      });
    } catch (e) {
      errCaught = true;
    }

    assert.strictEqual(errCaught, true);
    // Invariant: nothing committed!
    assert.strictEqual(sim.payments.size, 0);
    assert.strictEqual(sim.entitlements.size, 0);
    assert.strictEqual(sim.clients.get('c10').status, 'Lead');
    assert.strictEqual(sim.clients.get('c10').packages.length, 0);
  });

  // Test 11: Refund Processing
  await test('11. Refund transitions payment status, revokes entitlement, and expires package without deleting history', async () => {
    const sim = new TransactionSimulator();
    sim.clients.set('c11', { id: 'c11', name: 'Hany Salama', status: 'Lead', packages: [] });

    await sim.executePaymentTransaction({
      clientId: 'c11',
      clientName: 'Hany Salama',
      amount: 3000,
      amountPaid: 3000,
      operationId: 'op_refund_flow',
      systemPackage: samplePackage,
      packageType: samplePackage.name
    });

    const paymentId = Array.from(sim.payments.keys())[0]!;
    assert.ok(paymentId);
    await sim.refundPayment(paymentId);

    const refundedPayment = sim.payments.get(paymentId);
    assert.strictEqual(refundedPayment.status, 'refunded');
    assert.ok(refundedPayment.refundedAt);
    // Historical record MUST NOT be soft-deleted!
    assert.strictEqual(refundedPayment.deleted_at, undefined);

    const ent = Array.from(sim.entitlements.values())[0];
    assert.strictEqual(ent.status, 'revoked');

    const client = sim.clients.get('c11');
    assert.strictEqual(client.packages[0].status, 'Refunded');
  });

  // Test 12: Notification Failure Does Not Roll Back Financial State
  await test('12. Push notification failure does not roll back payment or cause double-charge', async () => {
    const sim = new TransactionSimulator();
    sim.clients.set('c12', { id: 'c12', name: 'Salma Hayek', status: 'Lead', packages: [] });

    await sim.executePaymentTransaction({
      clientId: 'c12',
      clientName: 'Salma Hayek',
      amount: 3000,
      amountPaid: 3000,
      operationId: 'op_notif_fail',
      systemPackage: samplePackage,
      packageType: samplePackage.name,
      failOnNotification: true
    });

    // Payment and entitlement are still 100% active and committed
    assert.strictEqual(sim.payments.size, 1);
    assert.strictEqual(sim.entitlements.size, 1);
    assert.strictEqual(sim.clients.get('c12').status, 'Active');
    assert.strictEqual(sim.notifications.length, 0); // notification failed cleanly
  });

  // Test 13: Points Earned Exactly Once
  await test('13. Points are awarded strictly once on actual money collected, never on unpaid balance', async () => {
    const sim = new TransactionSimulator();
    sim.clients.set('c13', { id: 'c13', name: 'Sherif Mounir', status: 'Lead', packages: [] });

    await sim.executePaymentTransaction({
      clientId: 'c13',
      clientName: 'Sherif Mounir',
      amount: 5000,
      amountPaid: 2500, // 2500 collected, 2500 remaining balance
      operationId: 'op_pts_1',
      systemPackage: samplePackage,
      packageType: samplePackage.name
    });

    const client = sim.clients.get('c13');
    // 2500 / 100 = 25 points. Unpaid 2500 gives 0 points.
    assert.strictEqual(client.points, 25);
    const wallet = sim.pointsWallets.get('c13');
    assert.strictEqual(wallet.balance, 25);
  });

  console.log('All Payment & Entitlement Integrity tests passed successfully! ✅\n');
}

runTests();
