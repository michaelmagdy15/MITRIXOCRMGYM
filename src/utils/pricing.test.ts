import assert from 'assert';
import { calculatePricing, roundCurrency, normalizeDiscountType } from './pricing';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

function runPricingTests() {
  console.log('Running pricing tests...');

  test('No discount, full payment', () => {
    const r = calculatePricing({ grossAmount: 1000 });
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.grossAmount, 1000);
    assert.strictEqual(r.netAmount, 1000);
    assert.strictEqual(r.amountPaid, 1000);
    assert.strictEqual(r.remainingBalance, 0);
    assert.strictEqual(r.discountAmount, 0);
  });

  test('Percentage discount', () => {
    const r = calculatePricing({ grossAmount: 1000, discountType: 'percentage', discountValue: 15 });
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.discountAmount, 150);
    assert.strictEqual(r.netAmount, 850);
    assert.strictEqual(r.amountPaid, 850);
    assert.strictEqual(r.remainingBalance, 0);
  });

  test('Fixed amount discount', () => {
    const r = calculatePricing({ grossAmount: 1000, discountType: 'amount', discountValue: 125 });
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.discountAmount, 125);
    assert.strictEqual(r.netAmount, 875);
  });

  test('Partial payment with discount', () => {
    const r = calculatePricing({ grossAmount: 1000, discountType: 'percentage', discountValue: 10, amountPaid: 400 });
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.netAmount, 900);
    assert.strictEqual(r.amountPaid, 400);
    assert.strictEqual(r.remainingBalance, 500);
  });

  test('Full 100% discount', () => {
    const r = calculatePricing({ grossAmount: 1000, discountType: 'percentage', discountValue: 100, amountPaid: 0 });
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.netAmount, 0);
    assert.strictEqual(r.amountPaid, 0);
    assert.strictEqual(r.remainingBalance, 0);
    assert.strictEqual(r.discountAmount, 1000);
  });

  test('Upgrade with discount on additional charge', () => {
    const r = calculatePricing({ grossAmount: 500, discountType: 'percentage', discountValue: 10, upgradeCredit: 0 });
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.netAmount, 450);
    assert.strictEqual(r.upgradeCredit, 0);
  });

  test('Upgrade credit reduces chargeable amount', () => {
    const r = calculatePricing({ grossAmount: 1000, upgradeCredit: 600 });
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.chargeBeforeDiscount, 400);
    assert.strictEqual(r.netAmount, 400);
  });

  test('Discount applies after upgrade credit', () => {
    const r = calculatePricing({ grossAmount: 1000, upgradeCredit: 600, discountType: 'amount', discountValue: 100 });
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.chargeBeforeDiscount, 400);
    assert.strictEqual(r.discountAmount, 100);
    assert.strictEqual(r.netAmount, 300);
  });

  test('Fixed discount capped at charge amount', () => {
    const r = calculatePricing({ grossAmount: 1000, discountType: 'amount', discountValue: 2000 });
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.discountAmount, 1000);
    assert.strictEqual(r.netAmount, 0);
  });

  test('Negative gross amount rejected', () => {
    const r = calculatePricing({ grossAmount: -100 });
    assert.strictEqual(r.valid, false);
    assert.ok(r.error);
  });

  test('Percentage above 100 rejected', () => {
    const r = calculatePricing({ grossAmount: 1000, discountType: 'percentage', discountValue: 101 });
    assert.strictEqual(r.valid, false);
    assert.ok(r.error);
  });

  test('Negative discount value rejected', () => {
    const r = calculatePricing({ grossAmount: 1000, discountType: 'amount', discountValue: -50 });
    assert.strictEqual(r.valid, false);
    assert.ok(r.error);
  });

  test('Negative amount paid rejected', () => {
    const r = calculatePricing({ grossAmount: 1000, amountPaid: -10 });
    assert.strictEqual(r.valid, false);
    assert.ok(r.error);
  });

  test('NaN gross amount rejected', () => {
    const r = calculatePricing({ grossAmount: NaN });
    assert.strictEqual(r.valid, false);
  });

  test('Infinity rejected', () => {
    const r = calculatePricing({ grossAmount: Infinity });
    assert.strictEqual(r.valid, false);
  });

  test('Zero-price package valid', () => {
    const r = calculatePricing({ grossAmount: 0 });
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.netAmount, 0);
    assert.strictEqual(r.amountPaid, 0);
  });

  test('Rounding: fractional price + percentage', () => {
    const r = calculatePricing({ grossAmount: 99.99, discountType: 'percentage', discountValue: 12.5 });
    assert.strictEqual(r.valid, true);
    // 99.99 * 0.125 = 12.49875 -> 12.50
    assert.strictEqual(r.discountAmount, 12.5);
    assert.strictEqual(r.netAmount, 87.49);
    assert.strictEqual(roundCurrency(r.discountAmount + r.netAmount), r.grossAmount);
  });

  test('No discount when type is none even if value supplied', () => {
    const r = calculatePricing({ grossAmount: 1000, discountType: 'none', discountValue: 500 });
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.discountAmount, 0);
    assert.strictEqual(r.netAmount, 1000);
  });

  test('normalizeDiscountType coerces values', () => {
    assert.strictEqual(normalizeDiscountType('percentage'), 'percentage');
    assert.strictEqual(normalizeDiscountType('amount'), 'amount');
    assert.strictEqual(normalizeDiscountType(''), 'none');
    assert.strictEqual(normalizeDiscountType(null), 'none');
    assert.strictEqual(normalizeDiscountType(undefined), 'none');
    assert.strictEqual(normalizeDiscountType('invalid'), 'none');
  });

  console.log('\nAll pricing tests passed ✅');
}

runPricingTests();
