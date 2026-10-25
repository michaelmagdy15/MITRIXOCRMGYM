import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extractPackageBenefits,
  hasPackageBenefitsChanged,
  createPackageVersionRecord,
  buildPackageSnapshotForClient,
  matchHistoricalPackageVersion,
  resolveEffectivePackageRules,
} from './packageVersioning';
import { Package, ClientPackage } from '../types';

describe('packageVersioning & Legacy Protection', () => {
  const basePackageV1: Package = {
    id: 'pkg-basic',
    name: 'Basic Annual Membership',
    benefitSubtitle: 'Wave 1 — Full Benefits',
    category: 'Membership',
    sessions: 0,
    expiryDays: 365,
    price: 5000,
    branch: 'ALL',
    type: 'Group',
    version: 1,
    benefits: {
      freePtSessions: 12,
      guestInvitations: 10,
      freeClassTrials: 4,
      freezeAllowanceDays: 30,
      minFreezeDays: 7,
      maxFreezeDays: 30,
    },
    freePtSessions: 12,
    guestInvitations: 10,
    freeClassTrials: 4,
    freezeAllowanceDays: 30,
    minFreezeDays: 7,
    maxFreezeDays: 30,
    isTimeRestricted: false,
  };

  it('detects when package benefits change while keeping the same name', () => {
    const unchangedCopy: Package = { ...basePackageV1 };
    assert.strictEqual(hasPackageBenefitsChanged(basePackageV1, unchangedCopy), false);

    const updatedWave2: Package = {
      ...basePackageV1,
      benefitSubtitle: 'Wave 2 — Reduced Perks',
      benefits: {
        ...extractPackageBenefits(basePackageV1),
        freePtSessions: 4,
        guestInvitations: 2,
      },
      freePtSessions: 4,
      guestInvitations: 2,
    };
    assert.strictEqual(hasPackageBenefitsChanged(basePackageV1, updatedWave2), true);
  });

  it('protects Cohort 1 members via immutable contract snapshot when Admin mutates Basic package for Cohort 2', () => {
    // 1. Cohort 1 member buys Basic Annual Membership (v1) on 2026-01-15
    const cohort1PurchaseIso = '2026-01-15T10:00:00.000Z';
    const cohort1Snapshot = buildPackageSnapshotForClient(basePackageV1, cohort1PurchaseIso);

    const cohort1ClientPkg: ClientPackage = {
      id: 'cp-cohort-1',
      packageName: basePackageV1.name,
      sessionsTotal: 0,
      sessionsRemaining: 0,
      startDate: '2026-01-15',
      endDate: '2027-01-15',
      status: 'Active',
      createdAt: cohort1PurchaseIso,
      ...cohort1Snapshot,
    };

    // 2. Next month (2026-02-01), Admin reduces benefits on the same "Basic Annual Membership" package (v2)
    const v2Timestamp = '2026-02-01T09:00:00.000Z';
    const v1HistoryEntry = createPackageVersionRecord(basePackageV1, {
      version: 1,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveUntil: v2Timestamp,
    });
    const mutatedCataloguePkgV2: Package = {
      ...basePackageV1,
      version: 2,
      benefitSubtitle: '2026 Q1 Standard Tier',
      benefits: {
        ...extractPackageBenefits(basePackageV1),
        freePtSessions: 2,
        guestInvitations: 0,
        freezeAllowanceDays: 14,
      },
      freePtSessions: 2,
      guestInvitations: 0,
      freezeAllowanceDays: 14,
      isTimeRestricted: true,
      allowedStartTime: '08:00',
      allowedEndTime: '16:00',
      versionHistory: [
        v1HistoryEntry,
        createPackageVersionRecord(
          {
            ...basePackageV1,
            benefitSubtitle: '2026 Q1 Standard Tier',
            freePtSessions: 2,
            guestInvitations: 0,
            freezeAllowanceDays: 14,
            isTimeRestricted: true,
            allowedStartTime: '08:00',
            allowedEndTime: '16:00',
            benefits: {
              ...extractPackageBenefits(basePackageV1),
              freePtSessions: 2,
              guestInvitations: 0,
              freezeAllowanceDays: 14,
            },
          },
          {
            version: 2,
            effectiveFrom: v2Timestamp,
          }
        ),
      ],
    };

    // 3. Cohort 2 member buys Basic Annual Membership (v2) on 2026-02-10
    const cohort2PurchaseIso = '2026-02-10T12:00:00.000Z';
    const cohort2ClientPkg: ClientPackage = {
      id: 'cp-cohort-2',
      packageName: mutatedCataloguePkgV2.name,
      sessionsTotal: 0,
      sessionsRemaining: 0,
      startDate: '2026-02-10',
      endDate: '2027-02-10',
      status: 'Active',
      createdAt: cohort2PurchaseIso,
      ...buildPackageSnapshotForClient(mutatedCataloguePkgV2, cohort2PurchaseIso),
    };

    // Verify nomenclature constraint: both packages have the exact same display name
    assert.strictEqual(cohort1ClientPkg.packageName, 'Basic Annual Membership');
    assert.strictEqual(cohort2ClientPkg.packageName, 'Basic Annual Membership');

    // Verify Cohort 1 retains original v1 benefits even when evaluated against mutatedCataloguePkgV2
    const resolvedCohort1 = resolveEffectivePackageRules(cohort1ClientPkg, undefined, mutatedCataloguePkgV2);
    assert.strictEqual(resolvedCohort1.packageVersion, 1);
    assert.strictEqual(resolvedCohort1.benefitSubtitle, 'Wave 1 — Full Benefits');
    assert.strictEqual(resolvedCohort1.benefits.freePtSessions, 12);
    assert.strictEqual(resolvedCohort1.benefits.guestInvitations, 10);
    assert.strictEqual(resolvedCohort1.benefits.freezeAllowanceDays, 30);
    assert.strictEqual(resolvedCohort1.isTimeRestricted, false);

    // Verify Cohort 2 receives the new v2 benefits
    const resolvedCohort2 = resolveEffectivePackageRules(cohort2ClientPkg, undefined, mutatedCataloguePkgV2);
    assert.strictEqual(resolvedCohort2.packageVersion, 2);
    assert.strictEqual(resolvedCohort2.benefitSubtitle, '2026 Q1 Standard Tier');
    assert.strictEqual(resolvedCohort2.benefits.freePtSessions, 2);
    assert.strictEqual(resolvedCohort2.benefits.guestInvitations, 0);
    assert.strictEqual(resolvedCohort2.benefits.freezeAllowanceDays, 14);
    assert.strictEqual(resolvedCohort2.isTimeRestricted, true);
    assert.strictEqual(resolvedCohort2.allowedStartTime, '08:00');
  });

  it('resolves historical version by effective date window for legacy pre-snapshot members', () => {
    const v2Timestamp = '2026-02-01T09:00:00.000Z';
    const pkgWithHistory: Package = {
      ...basePackageV1,
      version: 2,
      freePtSessions: 2,
      benefits: {
        ...extractPackageBenefits(basePackageV1),
        freePtSessions: 2,
      },
      versionHistory: [
        createPackageVersionRecord(basePackageV1, {
          version: 1,
          effectiveFrom: '2026-01-01T00:00:00.000Z',
          effectiveUntil: v2Timestamp,
        }),
        createPackageVersionRecord(
          {
            ...basePackageV1,
            freePtSessions: 2,
            benefits: { ...extractPackageBenefits(basePackageV1), freePtSessions: 2 },
          },
          {
            version: 2,
            effectiveFrom: v2Timestamp,
          }
        ),
      ],
    };

    // Legacy member record without embedded snapshot fields, purchased on 2026-01-20
    const legacyPreSnapshotClientPkg: ClientPackage = {
      id: 'cp-legacy-1',
      packageName: 'Basic Annual Membership',
      sessionsTotal: 0,
      sessionsRemaining: 0,
      startDate: '2026-01-20',
      endDate: '2027-01-20',
      status: 'Active',
    };

    const matchedV1 = matchHistoricalPackageVersion(pkgWithHistory, legacyPreSnapshotClientPkg.startDate);
    assert.strictEqual(matchedV1?.version, 1);

    const resolvedLegacy = resolveEffectivePackageRules(legacyPreSnapshotClientPkg, undefined, pkgWithHistory);
    assert.strictEqual(resolvedLegacy.packageVersion, 1);
    assert.strictEqual(resolvedLegacy.benefits.freePtSessions, 12);
    assert.strictEqual(resolvedLegacy.source, 'version_history');
  });
});
