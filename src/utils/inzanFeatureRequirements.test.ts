/**
 * Inzan Athletics feature-requirements acceptance suite.
 * Exercises the REAL production modules (no re-implemented helpers) so a
 * regression in any rule module fails here.
 *
 * Run: npx vite-node src/utils/inzanFeatureRequirements.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculatePricing } from './pricing';
import { resolvePaymentCategory, normalizePaymentCategory } from './paymentCategories';
import {
  isPrimaryMembershipPackage,
  validateMembershipEligibility,
  validatePackageTimeWindow,
  validateFreezeDurationLimits,
} from './membershipRules';
import { canDeleteClassSession } from './classDeletionGuardrail';
import { isFieldLockedForUser, sanitizeMemberProfileUpdates } from './memberProfileLocking';
import type { Client, Package, User } from '../types';

const INZAN = 'inzanathletics';
const NOW = new Date('2026-10-16T10:00:00.000Z');

const basePkg = (overrides: Partial<Package>): Package => ({
  id: 'pkg',
  name: 'Package',
  price: 1000,
  sessions: 10,
  expiryDays: 30,
  branch: 'ALL',
  type: 'Group',
  ...overrides,
});

describe('Inzan requirements — Packages module', () => {
  const primary = basePkg({ id: 'p1', name: 'Annual Gold', hierarchy: 'Primary' });
  const secondary = basePkg({ id: 's1', name: 'Recovery Add-on', hierarchy: 'Secondary' });

  it('explicit hierarchy overrides name/category heuristics', () => {
    assert.strictEqual(isPrimaryMembershipPackage(primary), true);
    assert.strictEqual(isPrimaryMembershipPackage(secondary), false);
    // A "membership"-named package explicitly marked Secondary stays Secondary
    assert.strictEqual(
      isPrimaryMembershipPackage(basePkg({ name: 'Membership Booster', hierarchy: 'Secondary' })),
      false
    );
  });

  it('blocks Secondary purchase without an active Primary, allows it with one', () => {
    const noPrimary: Client = { id: 'c1', name: 'A', phone: '1', status: 'Active', packages: [] };
    const blocked = validateMembershipEligibility(noPrimary, secondary, NOW, INZAN);
    assert.strictEqual(blocked.allowed, false);
    assert.ok(blocked.reason);

    const withPrimary: Client = {
      ...noPrimary,
      packages: [{ id: 'cp1', packageName: 'Annual Gold Membership', status: 'Active', endDate: '2027-10-16' }],
    };
    assert.strictEqual(validateMembershipEligibility(withPrimary, secondary, NOW, INZAN).allowed, true);
  });

  it('Primary purchase never requires an existing membership', () => {
    const fresh: Client = { id: 'c2', name: 'B', phone: '2', status: 'Lead', packages: [] };
    assert.strictEqual(validateMembershipEligibility(fresh, primary, NOW, INZAN).allowed, true);
  });

  it('enforces Morning Package time window (06:00–14:00)', () => {
    const morning = basePkg({ isTimeRestricted: true, allowedStartTime: '06:00', allowedEndTime: '14:00' });
    const at = (h: number, m: number) => new Date(2026, 9, 16, h, m);
    assert.strictEqual(validatePackageTimeWindow(morning, at(9, 30)).allowed, true);
    assert.strictEqual(validatePackageTimeWindow(morning, at(6, 0)).allowed, true);
    assert.strictEqual(validatePackageTimeWindow(morning, at(14, 0)).allowed, true);
    assert.strictEqual(validatePackageTimeWindow(morning, at(5, 59)).allowed, false);
    assert.strictEqual(validatePackageTimeWindow(morning, at(18, 0)).allowed, false);
    assert.strictEqual(validatePackageTimeWindow({ ...morning, isTimeRestricted: false }, at(23, 0)).allowed, true);
  });

  it('enforces freeze min / max / total allowance', () => {
    const pkg = basePkg({ freezeAllowanceDays: 30, minFreezeDays: 7, maxFreezeDays: 15 });
    assert.strictEqual(validateFreezeDurationLimits(pkg, 10, 0).allowed, true);
    assert.strictEqual(validateFreezeDurationLimits(pkg, 3, 0).allowed, false); // below min
    assert.strictEqual(validateFreezeDurationLimits(pkg, 20, 0).allowed, false); // above max
    assert.strictEqual(validateFreezeDurationLimits(pkg, 10, 25).allowed, false); // exceeds total
  });
});

describe('Inzan requirements — Payments & financials', () => {
  it('maps package categories for POS filtering', () => {
    assert.strictEqual(resolvePaymentCategory('Annual Gold Membership'), 'Memberships');
    assert.strictEqual(resolvePaymentCategory('12 Sessions', 'Personal Training'), 'PT');
    assert.strictEqual(resolvePaymentCategory('Monthly', 'SGF (Small Group Fitness)'), 'Classes');
    assert.strictEqual(resolvePaymentCategory('Monthly', 'Gymnastics'), 'Classes');
    assert.strictEqual(resolvePaymentCategory('Plan', 'Nutrition'), 'Nutrition');
    assert.strictEqual(normalizePaymentCategory('SGF'), 'Classes');
    assert.strictEqual(normalizePaymentCategory('Personal Training'), 'PT');
    assert.strictEqual(normalizePaymentCategory('Membership'), 'Memberships');
  });

  it('applies custom percentage and fixed discounts', () => {
    const pct = calculatePricing({ grossAmount: 10000, discountType: 'percentage', discountValue: 15, amountPaid: 8500 });
    assert.strictEqual(pct.valid, true);
    assert.strictEqual(pct.discountAmount, 1500);
    assert.strictEqual(pct.netAmount, 8500);

    const fixed = calculatePricing({ grossAmount: 5000, discountType: 'amount', discountValue: 1250, amountPaid: 2000 });
    assert.strictEqual(fixed.netAmount, 3750);
    assert.strictEqual(fixed.remainingBalance, 1750);
  });
});

describe('Inzan requirements — Classes module', () => {
  it('blocks session deletion until attendees and waitlist are cleared', () => {
    assert.strictEqual(canDeleteClassSession({ attendees: [], waitlist: [] }).allowed, true);
    const withAttendees = canDeleteClassSession({ attendees: ['m1', 'm2'], waitlist: [] });
    assert.strictEqual(withAttendees.allowed, false);
    assert.strictEqual(withAttendees.activeBookingsCount, 2);
    const withWaitlist = canDeleteClassSession({ attendees: [], waitlist: ['m3'] });
    assert.strictEqual(withWaitlist.allowed, false);
    assert.strictEqual(withWaitlist.waitlistCount, 1);
  });
});

describe('Inzan requirements — Member account module', () => {
  const manager: User = { id: 'u1', name: 'Mgr', email: 'm@x.com', role: 'manager' };
  const member: Client = { id: 'c1', name: 'Youssef', phone: '+20100', status: 'Active', email: 'old@x.com' };

  it('locks core identity fields, keeps additional info editable', () => {
    assert.strictEqual(isFieldLockedForUser('name', manager, member), true);
    assert.strictEqual(isFieldLockedForUser('phone', manager, member), true);
    assert.strictEqual(isFieldLockedForUser('email', manager, member), false);
    assert.strictEqual(isFieldLockedForUser('medicalInfo', manager, member), false);
  });

  it('sanitizes tampered updates to locked fields', () => {
    const out = sanitizeMemberProfileUpdates({ name: 'Tampered', email: 'new@x.com' }, member, manager);
    assert.strictEqual(out.name, 'Youssef');
    assert.strictEqual(out.email, 'new@x.com');
  });
});

import { computeMemberBenefitsSummary, promoteNextWaitlistedMember } from './memberBenefitsWallet';
import {
  normalizeWhatsAppPhone,
  buildWhatsAppPaymentReceiptUrl,
  buildWhatsAppRenewalReminderUrl,
  buildWhatsAppWaitlistPromotionUrl,
} from './whatsappTemplates';

describe('Core UX Improvements — Benefits Wallet, Waitlist Auto-Promote & WhatsApp Templates', () => {
  it('computes live member benefits wallet summary from active packages and usage logs', () => {
    const cataloguePackages: Package[] = [
      basePkg({
        id: 'pkg_gold',
        name: 'Annual Gold Membership',
        category: 'Membership',
        hierarchy: 'Primary',
        freePtSessions: 4,
        freeClassTrials: 2,
        guestInvitations: 5,
        freezeAllowanceDays: 30,
        minFreezeDays: 7,
        maxFreezeDays: 15,
        isTimeRestricted: true,
        allowedStartTime: '06:00',
        allowedEndTime: '14:00',
      }),
      basePkg({
        id: 'pkg_pt',
        name: 'PT 12 Sessions',
        category: 'Personal Training',
        hierarchy: 'Secondary',
      }),
    ];

    const member: Client = {
      id: 'c10',
      name: 'Karim',
      phone: '01012345678',
      status: 'Active',
      ptSessionsRemaining: 3,
      packages: [
        {
          id: 'cp_gold',
          packageName: 'Annual Gold Membership',
          status: 'Active',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          freezeDaysUsed: 10,
        },
        {
          id: 'cp_pt',
          packageName: 'PT 12 Sessions',
          status: 'Active',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        },
      ],
    };

    const summary = computeMemberBenefitsSummary(member, cataloguePackages, 2, NOW);
    assert.ok(summary.activePrimaryPackage);
    assert.strictEqual(summary.activePrimaryPackage?.name, 'Annual Gold Membership');
    assert.strictEqual(summary.activeSecondaryCount, 1);
    assert.strictEqual(summary.activePrimaryPackage?.isTimeRestricted, true);
    assert.strictEqual(summary.ptSessions.total, 4);
    assert.strictEqual(summary.ptSessions.remaining, 3);
    assert.strictEqual(summary.guestInvitations.total, 5);
    assert.strictEqual(summary.guestInvitations.used, 2);
    assert.strictEqual(summary.guestInvitations.remaining, 3);
    assert.strictEqual(summary.freezeAllowance.totalDays, 30);
    assert.strictEqual(summary.freezeAllowance.usedDays, 10);
    assert.strictEqual(summary.freezeAllowance.remainingDays, 20);
  });

  it('auto-promotes first waitlisted member in FIFO order when an attendee is removed', () => {
    const res = promoteNextWaitlistedMember(['m1', 'm2', 'm3'], ['w1', 'w2'], 3, 'm2');
    assert.strictEqual(res.promotedMemberId, 'w1');
    assert.deepStrictEqual(res.updatedAttendees, ['m1', 'm3', 'w1']);
    assert.deepStrictEqual(res.updatedWaitlist, ['w2']);
  });

  it('normalizes Egyptian mobile numbers and builds WhatsApp deep links', () => {
    assert.strictEqual(normalizeWhatsAppPhone('01012345678'), '201012345678');
    assert.strictEqual(normalizeWhatsAppPhone('+20 122 333 4444'), '201223334444');

    const receiptUrl = buildWhatsAppPaymentReceiptUrl({
      payment: {
        id: 'pay1',
        clientId: 'c10',
        client_name: 'Karim',
        amount: 5000,
        amount_paid: 5000,
        date: '2026-10-16',
        method: 'Cash',
        packageType: 'Annual Gold',
        package_category_type: 'Memberships',
        sales_rep_id: 's1',
        created_at: '2026-10-16T10:00:00.000Z',
        notes: 'Paid [Split Tender: Cash 3000 LE + Instapay 2000 LE]',
      },
      client: { id: 'c10', name: 'Karim', phone: '01012345678', status: 'Active' },
      clubName: 'Inzan Athletics',
    });
    assert.ok(receiptUrl?.startsWith('https://wa.me/201012345678?text='));
    assert.ok(decodeURIComponent(receiptUrl!).includes('Cash (Split Tender)'));

    const promoUrl = buildWhatsAppWaitlistPromotionUrl({
      clientName: 'Karim',
      clientPhone: '01012345678',
      clubName: 'Strike Boxing',
      className: 'Adult Boxing',
      classDate: 'Fri, 16 Oct 2026',
      classTime: '18:00',
    });
    assert.ok(promoUrl?.startsWith('https://wa.me/201012345678?text='));

    const renewUrl = buildWhatsAppRenewalReminderUrl({
      client: { id: 'c10', name: 'Karim', phone: '01012345678', status: 'Active', packageType: 'Annual Gold' },
      clubName: 'Inzan Athletics',
    });
    assert.ok(renewUrl?.startsWith('https://wa.me/201012345678?text='));
  });
});

