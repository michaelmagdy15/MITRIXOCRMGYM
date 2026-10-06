import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateShiftReconciliation,
  generateShiftReconciliationCSV,
  normalizeMethodCategory
} from './shiftReconciliation';
import { Payment } from '../types';

function createMockPayment(overrides: Partial<Payment>): Payment {
  return {
    id: 'pay_' + Math.random().toString(36).substring(7),
    clientId: 'client_1',
    client_name: 'Test Client',
    amount: 1000,
    amount_paid: 1000,
    date: '2026-10-06T12:00:00.000Z',
    method: 'Cash',
    packageType: 'Gym Membership',
    package_category_type: 'Memberships',
    sales_rep_id: 'sales_1',
    created_at: '2026-10-06T12:00:00.000Z',
    deleted_at: null,
    branch: 'New Cairo',
    ...overrides
  };
}

console.log('Running Shift Reconciliation tests...');

// Test 1: Full Payment
(() => {
  const payments: Payment[] = [
    createMockPayment({ amount: 1500, amount_paid: 1500, method: 'Cash' }),
    createMockPayment({ amount: 2000, amount_paid: 2000, method: 'Credit Card' }),
    createMockPayment({ amount: 3500, amount_paid: 3500, method: 'Instapay' }),
    createMockPayment({ amount: 5000, amount_paid: 5000, method: 'Bank Transfer' })
  ];

  const report = calculateShiftReconciliation(payments, {
    date: '2026-10-06',
    declared: {
      cash: 1500,
      visa: 2000,
      instapay: 3500,
      bankTransfer: 5000
    }
  });

  assert.equal(report.system.cash, 1500);
  assert.equal(report.system.visa, 2000);
  assert.equal(report.system.instapay, 3500);
  assert.equal(report.system.bankTransfer, 5000);
  assert.equal(report.system.totalCollected, 12000);
  assert.equal(report.declared.total, 12000);
  assert.equal(report.variance.total, 0);
  assert.equal(report.status, 'Balanced');
  console.log('  ✓ Test 1: Full payments across all methods balanced successfully');
})();

// Test 2: Partial Payment preserves outstanding balance
(() => {
  const payments: Payment[] = [
    createMockPayment({
      amount: 4000, // Total package cost
      amount_paid: 2500, // Deposit collected today
      method: 'Cash'
    })
  ];

  const report = calculateShiftReconciliation(payments, {
    date: '2026-10-06',
    declared: { cash: 2500 }
  });

  assert.equal(report.system.cash, 2500, 'Cash collected must match amount_paid');
  assert.equal(report.system.totalCollected, 2500);
  assert.equal(report.system.outstandingBalancesTotal, 1500, 'Outstanding balance should be 4000 - 2500 = 1500');
  assert.equal(report.variance.cash, 0);
  console.log('  ✓ Test 2: Partial payment correctly tracks collected cash vs outstanding balance');
})();

// Test 3: Discount calculation
(() => {
  const payments: Payment[] = [
    createMockPayment({
      amount: 4500,
      amount_paid: 4500,
      originalAmount: 5000, // 500 LE discount
      discountType: 'amount',
      discountValue: 500,
      method: 'Cash'
    })
  ];

  const report = calculateShiftReconciliation(payments, {
    date: '2026-10-06',
    declared: { cash: 4500 }
  });

  assert.equal(report.system.cash, 4500);
  assert.equal(report.system.discountsTotal, 500);
  console.log('  ✓ Test 3: Discounts are separated and recorded without skewing cash totals');
})();

// Test 4: Refund exclusion
(() => {
  const payments: Payment[] = [
    createMockPayment({ amount: 2000, amount_paid: 2000, method: 'Cash' }),
    createMockPayment({
      amount: 1500,
      amount_paid: 1500,
      method: 'Cash',
      status: 'refunded',
      refundAmount: 1500
    })
  ];

  const report = calculateShiftReconciliation(payments, {
    date: '2026-10-06',
    declared: { cash: 2000 }
  });

  assert.equal(report.system.cash, 2000, 'Refunded payment must be excluded from collected cash');
  assert.equal(report.system.refundsCount, 1);
  assert.equal(report.system.refundsTotal, 1500);
  assert.equal(report.variance.total, 0);
  console.log('  ✓ Test 4: Refunded payments excluded from collected money and reported separately');
})();

// Test 5: Soft-deleted and Pending/Failed exclusions
(() => {
  const payments: Payment[] = [
    createMockPayment({ amount: 1000, amount_paid: 1000, method: 'Cash' }),
    createMockPayment({ amount: 800, amount_paid: 800, method: 'Cash', deleted_at: '2026-10-06T14:00:00.000Z' }),
    createMockPayment({ amount: 1200, amount_paid: 1200, method: 'Cash', status: 'pending' }),
    createMockPayment({ amount: 900, amount_paid: 900, method: 'Cash', status: 'failed' })
  ];

  const report = calculateShiftReconciliation(payments, {
    date: '2026-10-06',
    declared: { cash: 1000 }
  });

  assert.equal(report.system.cash, 1000);
  assert.equal(report.system.transactionCount, 1);
  console.log('  ✓ Test 5: Soft-deleted, pending, and failed payments excluded');
})();

// Test 6: Multiple branches filtering
(() => {
  const payments: Payment[] = [
    createMockPayment({ amount: 1000, amount_paid: 1000, branch: 'New Cairo', method: 'Cash' }),
    createMockPayment({ amount: 2000, amount_paid: 2000, branch: 'Zamalek', method: 'Cash' })
  ];

  const reportCairo = calculateShiftReconciliation(payments, {
    date: '2026-10-06',
    branch: 'New Cairo',
    declared: { cash: 1000 }
  });
  assert.equal(reportCairo.system.cash, 1000);

  const reportAll = calculateShiftReconciliation(payments, {
    date: '2026-10-06',
    branch: 'ALL',
    declared: { cash: 3000 }
  });
  assert.equal(reportAll.system.cash, 3000);
  console.log('  ✓ Test 6: Branch scoping filters payments accurately');
})();

// Test 7: Date boundary handling
(() => {
  const payments: Payment[] = [
    createMockPayment({ amount: 1000, amount_paid: 1000, date: '2026-10-05T23:59:00.000Z', method: 'Cash' }),
    createMockPayment({ amount: 2000, amount_paid: 2000, date: '2026-10-06T00:01:00.000Z', method: 'Cash' }),
    createMockPayment({ amount: 3000, amount_paid: 3000, date: '2026-10-07T08:00:00.000Z', method: 'Cash' })
  ];

  const report = calculateShiftReconciliation(payments, {
    date: '2026-10-06',
    declared: { cash: 2000 }
  });

  assert.equal(report.system.cash, 2000);
  console.log('  ✓ Test 7: Date boundary filters only payments of the target date');
})();

// Test 8: Discrepancy detection
(() => {
  const payments: Payment[] = [
    createMockPayment({ amount: 2000, amount_paid: 2000, method: 'Cash' })
  ];

  const report = calculateShiftReconciliation(payments, {
    date: '2026-10-06',
    declared: { cash: 1950 } // 50 EGP short
  });

  assert.equal(report.variance.cash, -50);
  assert.equal(report.variance.hasDiscrepancy, true);
  assert.equal(report.status, 'Discrepancy');
  console.log('  ✓ Test 8: Discrepancies flagged with exact variance');
})();

// Test 9: CSV export generation
(() => {
  const payments: Payment[] = [
    createMockPayment({ amount: 1500, amount_paid: 1500, method: 'Cash' }),
    createMockPayment({ amount: 3000, amount_paid: 3000, method: 'Instapay' })
  ];

  const report = calculateShiftReconciliation(payments, {
    date: '2026-10-06',
    branch: 'New Cairo',
    shiftType: 'Evening',
    cashierName: 'Ahmed FrontDesk',
    declared: { cash: 1500, instapay: 3000 }
  });

  const csv = generateShiftReconciliationCSV(report);
  assert.ok(csv.includes('INZAN ATHLETICS — FRONT DESK SHIFT RECONCILIATION REPORT'));
  assert.ok(csv.includes('Cash,1500.00,1500.00,0.00,OK'));
  assert.ok(csv.includes('Instapay,3000.00,3000.00,0.00,OK'));
  assert.ok(csv.includes('Status,Balanced'));
  console.log('  ✓ Test 9: Clean RFC-compliant CSV report produced');
})();

console.log('\nAll Shift Reconciliation tests passed successfully! ✅');
