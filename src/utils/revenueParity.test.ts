import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getEffectivePaymentCollected,
  buildSyncedPaymentAmountUpdates,
} from './pricing';
import { resolvePaymentBranch } from './branchUtils';
import { getGymDateString } from './dateUtils';
import { SALES_NAME_MAPPING } from '../constants';

describe('Revenue parity across Dashboard, Leaderboard, Reports, and Payments', () => {
  it('getEffectivePaymentCollected clamps stale amount_paid > amount while preserving partial & zero payments', () => {
    // Full payment
    assert.strictEqual(getEffectivePaymentCollected({ amount: 5000, amount_paid: 5000 }), 5000);
    // Genuine partial payment
    assert.strictEqual(getEffectivePaymentCollected({ amount: 5000, amount_paid: 2000 }), 2000);
    // Zero-down / deferred payment preserves 0 (not treated as falsy amount)
    assert.strictEqual(getEffectivePaymentCollected({ amount: 5000, amount_paid: 0 }), 0);
    // Real Strike Maison Mohamed case (edited 6350 -> 2050 leaving stale amount_paid: 6350)
    assert.strictEqual(getEffectivePaymentCollected({ amount: 2050, amount_paid: 6350 }), 2050);
    // Real Strike Mostafa Mahmoud BF OFFER case (edited 11000 -> 2500 leaving stale amount_paid: 11000)
    assert.strictEqual(getEffectivePaymentCollected({ amount: 2500, amount_paid: 11000 }), 2500);
    // Missing or NaN amount_paid falls back cleanly to amount
    assert.strictEqual(getEffectivePaymentCollected({ amount: 3500, amount_paid: null }), 3500);
    assert.strictEqual(getEffectivePaymentCollected({ amount: 3500, amount_paid: Number.NaN }), 3500);
    // Refunded / zeroed amount stays 0
    assert.strictEqual(getEffectivePaymentCollected({ amount: 0, amount_paid: 500 }), 0);
  });

  it('buildSyncedPaymentAmountUpdates keeps amount_paid, discountedAmount, and balance synced on Edit Payment', () => {
    // Full payment edited down (Maison: 6350 -> 2050)
    assert.deepStrictEqual(
      buildSyncedPaymentAmountUpdates(
        { amount: 6350, amount_paid: 6350, remainingBalance: 0, isPartialPayment: false },
        2050
      ),
      {
        amount: 2050,
        amount_paid: 2050,
        discountedAmount: 2050,
        remainingBalance: 0,
        isPartialPayment: false,
      }
    );

    // Full payment edited up (2500 -> 4000)
    assert.deepStrictEqual(
      buildSyncedPaymentAmountUpdates(
        { amount: 2500, amount_paid: 2500, remainingBalance: 0, isPartialPayment: false },
        4000
      ),
      {
        amount: 4000,
        amount_paid: 4000,
        discountedAmount: 4000,
        remainingBalance: 0,
        isPartialPayment: false,
      }
    );

    // Partial payment edited to a higher total above what was paid preserves deposit & recalculates debt
    assert.deepStrictEqual(
      buildSyncedPaymentAmountUpdates(
        { amount: 5000, amount_paid: 2000, remainingBalance: 3000, isPartialPayment: true },
        6000
      ),
      {
        amount: 6000,
        amount_paid: 2000,
        discountedAmount: 6000,
        remainingBalance: 4000,
        isPartialPayment: true,
      }
    );

    // Partial payment edited down below what was paid caps amount_paid cleanly to new total
    assert.deepStrictEqual(
      buildSyncedPaymentAmountUpdates(
        { amount: 5000, amount_paid: 2500, remainingBalance: 2500, isPartialPayment: true },
        2000
      ),
      {
        amount: 2000,
        amount_paid: 2000,
        discountedAmount: 2000,
        remainingBalance: 0,
        isPartialPayment: false,
      }
    );
  });

  it('cross-branch payments belong strictly to their resolved payment branch without home-branch double counting', () => {
    const maximClient = { id: 'c_maxim', branch: 'Maxim Compound' };
    const impactClient = { id: 'c_impact', branch: 'Impact by Strike' };

    const mividaPaymentByMaximMember = {
      id: 'AcbyK7JQbjwMdmeWUeOu',
      clientId: 'c_maxim',
      branch: 'Mivida Compound',
      branchId: 'strike_mivida',
      amount: 2500,
    };
    const maximPaymentByImpactMember = {
      id: 'Sc6lJjrSalWvaXBkr4zt',
      clientId: 'c_impact',
      branch: 'Maxim Compound',
      branchId: 'strike_maxim',
      amount: 9000,
    };

    const p1Branch = resolvePaymentBranch(mividaPaymentByMaximMember, maximClient);
    const p2Branch = resolvePaymentBranch(maximPaymentByImpactMember, impactClient);

    assert.strictEqual(p1Branch, 'Mivida Compound');
    assert.strictEqual(p2Branch, 'Maxim Compound');

    // Selecting Maxim Compound must exclude Mivida payment even if client home branch is Maxim
    const payments = [mividaPaymentByMaximMember, maximPaymentByImpactMember];
    const clientsById = new Map([
      [maximClient.id, maximClient],
      [impactClient.id, impactClient],
    ]);
    const maximSum = payments
      .filter((p) => resolvePaymentBranch(p, clientsById.get(p.clientId)) === 'Maxim Compound')
      .reduce((s, p) => s + getEffectivePaymentCollected(p), 0);
    const impactSum = payments
      .filter((p) => resolvePaymentBranch(p, clientsById.get(p.clientId)) === 'Impact by Strike')
      .reduce((s, p) => s + getEffectivePaymentCollected(p), 0);
    const mividaSum = payments
      .filter((p) => resolvePaymentBranch(p, clientsById.get(p.clientId)) === 'Mivida Compound')
      .reduce((s, p) => s + getEffectivePaymentCollected(p), 0);

    assert.strictEqual(maximSum + mividaSum + impactSum, 11500);
    assert.strictEqual(maximSum, 9000);
    assert.strictEqual(mividaSum, 2500);
    assert.strictEqual(impactSum, 0);
  });

  it('rep attribution is mutually exclusive when explicit salesName differs from sales_rep_id', () => {
    const canonMap = new Map(
      Object.entries(SALES_NAME_MAPPING).map(([a, c]) => [a.trim().toLowerCase(), c.trim().toLowerCase()])
    );
    const toCanon = (n?: string | null) => {
      if (!n) return '';
      const k = n.trim().toLowerCase();
      return canonMap.get(k) ?? k;
    };
    const isAttributed = (p: any, repId: string, repName: string) => {
      const sn = (p.salesName || '').trim();
      if (sn) return toCanon(sn) !== '' && toCanon(sn) === toCanon(repName);
      if (p.sales_rep_id) return p.sales_rep_id === repId;
      return false;
    };

    const conflictingPayment = {
      id: 'a49mv9KXlquW3eUr6VcB',
      sales_rep_id: 'hassan_id',
      salesName: 'Maison Mohmed', // Alias for Maison Mohamed
      amount: 3150,
    };

    assert.strictEqual(isAttributed(conflictingPayment, 'maison_id', 'Maison Mohamed'), true);
    assert.strictEqual(isAttributed(conflictingPayment, 'hassan_id', 'Hassan Tarek'), false);
  });

  it('Cairo timezone month grouping keeps late-night Dec/Jan UTC instants in the same gym month', () => {
    // 2025-12-31T22:00:00.000Z is 2026-01-01 00:00 in Africa/Cairo (UTC+2 winter)
    const gymDate = getGymDateString('2025-12-31T22:00:00.000Z');
    assert.strictEqual(gymDate, '2026-01-01');
    assert.strictEqual(gymDate.slice(0, 7), '2026-01');
  });
});
