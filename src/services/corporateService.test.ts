import assert from 'assert';
import { applyCorporateBenefitsToPackage } from './corporateService';
import { CorporateAccount } from '../types/corporate';

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
  console.log('Running Corporate Accounts & Deals unit tests...');

  const basePackage = {
    id: 'pkg-12m',
    name: '12 Month Full Membership',
    price: 6000,
    expiryDays: 365,
    freezeAllowanceDays: 30,
    freePtSessions: 1,
    guestInvitations: 2,
  };

  const cibCorporate: CorporateAccount = {
    id: 'corp-cib',
    tenantId: 'strike',
    companyName: 'Commercial International Bank',
    corporateCode: 'CIB-CORP',
    domain: '@cibeg.com',
    contactPerson: 'Ahmed Hassan',
    contactEmail: 'corporate@cibeg.com',
    contactPhone: '+201012345678',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    benefits: {
      discountType: 'percentage',
      discountValue: 20, // 20%
      extraDurationDays: 30, // +1 month
      extraFreezeDays: 15,
      extraPtSessions: 2,
      extraGuestPasses: 3,
    },
  };

  // Test 1: Percentage discount calculation & all perks
  await test('1. Calculates 20% percentage discount and adds all extra perks', () => {
    const result = applyCorporateBenefitsToPackage(basePackage, cibCorporate);
    // 6000 - 20% = 4800
    assert.strictEqual(result.discountedPrice, 4800);
    assert.strictEqual(result.extraDurationDays, 30);
    assert.strictEqual(result.extraFreezeDays, 15);
    assert.strictEqual(result.extraPtSessions, 2);
    assert.strictEqual(result.extraGuestPasses, 3);
  });

  // Test 2: Fixed amount discount calculation
  await test('2. Calculates fixed amount discount (e.g. 1500 LE off)', () => {
    const fixedCorporate: CorporateAccount = {
      ...cibCorporate,
      benefits: {
        ...cibCorporate.benefits,
        discountType: 'fixed',
        discountValue: 1500,
      },
    };

    const result = applyCorporateBenefitsToPackage(basePackage, fixedCorporate);
    assert.strictEqual(result.discountedPrice, 4500); // 6000 - 1500
    assert.strictEqual(result.extraPtSessions, 2);
  });

  // Test 3: Discount exceeding package price caps at 0
  await test('3. Fixed discount exceeding price caps discounted price at 0 LE', () => {
    const hugeDiscountCorp: CorporateAccount = {
      ...cibCorporate,
      benefits: {
        ...cibCorporate.benefits,
        discountType: 'fixed',
        discountValue: 10000,
      },
    };

    const result = applyCorporateBenefitsToPackage(basePackage, hugeDiscountCorp);
    assert.strictEqual(result.discountedPrice, 0);
  });

  // Test 4: Inactive corporate account does not apply any perks or discounts
  await test('4. Inactive corporate account returns base price and zero added perks', () => {
    const inactiveCorp: CorporateAccount = {
      ...cibCorporate,
      isActive: false,
    };

    const result = applyCorporateBenefitsToPackage(basePackage, inactiveCorp);
    assert.strictEqual(result.discountedPrice, 6000);
    assert.strictEqual(result.extraDurationDays, 0);
    assert.strictEqual(result.extraFreezeDays, 0);
    assert.strictEqual(result.extraPtSessions, 0);
    assert.strictEqual(result.extraGuestPasses, 0);
  });

  // Test 5: Specific eligible packages restriction
  await test('5. Respects eligiblePackageIds whitelist', () => {
    const restrictedCorp: CorporateAccount = {
      ...cibCorporate,
      benefits: {
        ...cibCorporate.benefits,
        eligiblePackageIds: ['pkg-special-annual'],
      },
    };

    // When package is not in the whitelist:
    const nonEligibleResult = applyCorporateBenefitsToPackage(basePackage, restrictedCorp);
    assert.strictEqual(nonEligibleResult.discountedPrice, 6000);
    assert.strictEqual(nonEligibleResult.extraDurationDays, 0);

    // When package is in the whitelist:
    const eligiblePkg = { ...basePackage, id: 'pkg-special-annual' };
    const eligibleResult = applyCorporateBenefitsToPackage(eligiblePkg, restrictedCorp);
    assert.strictEqual(eligibleResult.discountedPrice, 4800);
    assert.strictEqual(eligibleResult.extraDurationDays, 30);
  });

  // Test 6: Safe fallback on missing package or corporate null
  await test('6. Safe fallbacks for empty / null package or corporate', () => {
    const result1 = applyCorporateBenefitsToPackage(null as any, cibCorporate);
    assert.strictEqual(result1.discountedPrice, 0);
    assert.strictEqual(result1.extraDurationDays, 30);

    const result2 = applyCorporateBenefitsToPackage(basePackage, null as any);
    assert.strictEqual(result2.discountedPrice, 6000);
    assert.strictEqual(result2.extraDurationDays, 0);
  });

  console.log('All Corporate Accounts & Deals unit tests passed successfully!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
