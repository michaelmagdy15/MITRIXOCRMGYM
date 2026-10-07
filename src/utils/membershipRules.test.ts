import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isPrimaryMembershipPackage,
  isAcademyOrExemptPackage,
  isClientUnder16OrJunior,
  hasActivePrimaryMembership,
  validateMembershipEligibility
} from './membershipRules';
import { Client, Package } from '../types';

describe('Inzan Athletics Membership Hierarchy & Eligibility Rules', () => {
  const primaryPackage: Package = {
    id: 'pkg-basic',
    name: 'Basic Membership',
    category: 'Membership',
    price: 37500,
    sessions: 0,
    expiryDays: 365,
    branch: 'ALL',
    type: 'Group'
  };

  const ptPackage: Package = {
    id: 'pkg-pt-12',
    name: '1-on-1 PT (12 Sessions)',
    category: 'Personal Training',
    price: 6000,
    sessions: 12,
    expiryDays: 60,
    branch: 'ALL',
    type: 'Private'
  };

  const nutritionPackage: Package = {
    id: 'pkg-nut',
    name: 'Nutrition Consultation Plan',
    category: 'Nutrition',
    price: 2500,
    sessions: 4,
    expiryDays: 60,
    branch: 'ALL',
    type: 'Other'
  };

  const sgfPackage: Package = {
    id: 'pkg-sgf',
    name: 'SGF Academy Monthly',
    category: 'SGF',
    price: 4500,
    sessions: 12,
    expiryDays: 30,
    branch: 'ALL',
    type: 'Group'
  };

  const mmaPackage: Package = {
    id: 'pkg-mma',
    name: 'MMA Academy Classes',
    category: 'Classes',
    price: 4000,
    sessions: 12,
    expiryDays: 30,
    branch: 'ALL',
    type: 'Group'
  };

  const adultWithoutMembership: Client = {
    id: 'client-adult-none',
    name: 'Adult Non-Member',
    phone: '01000000001',
    status: 'Expired',
    dateOfBirth: '1995-05-15',
    memberCategory: 'Adults'
  };

  const adultWithMembership: Client = {
    id: 'client-adult-active',
    name: 'Adult Active Member',
    phone: '01000000002',
    status: 'Active',
    dateOfBirth: '1995-05-15',
    memberCategory: 'Adults',
    membershipExpiry: '2027-01-01T00:00:00.000Z',
    packages: [
      {
        id: 'cp-1',
        packageName: 'Basic Membership',
        status: 'Active',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2027-01-01T00:00:00.000Z'
      }
    ]
  };

  const kidUnder16: Client = {
    id: 'client-kid',
    name: 'Junior Athlete',
    phone: '01000000003',
    status: 'Active',
    dateOfBirth: '2012-08-20', // Age 14 in 2026
    memberCategory: 'Kids Only'
  };

  it('1. Primary membership package detection', () => {
    assert.strictEqual(isPrimaryMembershipPackage(primaryPackage), true);
    assert.strictEqual(isPrimaryMembershipPackage({ name: 'Annual Membership' }), true);
    assert.strictEqual(isPrimaryMembershipPackage(ptPackage), false);
    assert.strictEqual(isPrimaryMembershipPackage(nutritionPackage), false);
    assert.strictEqual(isPrimaryMembershipPackage(sgfPackage), false);
  });

  it('2. Academy and exempt package detection (SGF, MMA, Gymnastics)', () => {
    assert.strictEqual(isAcademyOrExemptPackage(sgfPackage), true);
    assert.strictEqual(isAcademyOrExemptPackage(mmaPackage), true);
    assert.strictEqual(isAcademyOrExemptPackage({ category: 'Gymnastics', name: 'Gymnastics Kids' }), true);
    assert.strictEqual(isAcademyOrExemptPackage({ category: 'Drop-in / Day Pass', name: 'Day Pass' }), true);
    assert.strictEqual(isAcademyOrExemptPackage(ptPackage), false);
    assert.strictEqual(isAcademyOrExemptPackage(nutritionPackage), false);
  });

  it('3. Under-16 kid detection via date of birth and category', () => {
    assert.strictEqual(isClientUnder16OrJunior(kidUnder16), true);
    assert.strictEqual(isClientUnder16OrJunior(adultWithoutMembership), false);
    assert.strictEqual(isClientUnder16OrJunior({ id: 'c1', name: 'Junior', phone: '010', memberCategory: 'Junior Only', status: 'Active' }), true);
  });

  it('4. Purchasing a primary membership is always allowed', () => {
    const res = validateMembershipEligibility(adultWithoutMembership, primaryPackage);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.isPrimaryMembership, true);
  });

  it('5. Adult without primary membership cannot purchase PT', () => {
    const res = validateMembershipEligibility(adultWithoutMembership, ptPackage);
    assert.strictEqual(res.allowed, false);
    assert.match(res.reason || '', /primary gym membership is required/i);
  });

  it('6. Adult with active primary membership can purchase PT', () => {
    const res = validateMembershipEligibility(adultWithMembership, ptPackage);
    assert.strictEqual(res.allowed, true);
  });

  it('7. Adult without primary membership cannot purchase Nutrition', () => {
    const res = validateMembershipEligibility(adultWithoutMembership, nutritionPackage);
    assert.strictEqual(res.allowed, false);
    assert.match(res.reason || '', /primary gym membership is required/i);
  });

  it('8. Adult with active primary membership can purchase Nutrition', () => {
    const res = validateMembershipEligibility(adultWithMembership, nutritionPackage);
    assert.strictEqual(res.allowed, true);
  });

  it('9. Young kids 16 and below CAN purchase PT without a primary membership', () => {
    const res = validateMembershipEligibility(kidUnder16, ptPackage);
    assert.strictEqual(res.allowed, true);
    assert.match(res.exemptionReason || '', /Kids 16 and below/i);
  });

  it('10. Anyone can purchase Academy classes (SGF, MMA) without a primary membership', () => {
    const resSgf = validateMembershipEligibility(adultWithoutMembership, sgfPackage);
    assert.strictEqual(resSgf.allowed, true);

    const resMma = validateMembershipEligibility(adultWithoutMembership, mmaPackage);
    assert.strictEqual(resMma.allowed, true);
  });
});
