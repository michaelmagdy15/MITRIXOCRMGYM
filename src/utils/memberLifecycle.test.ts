import assert from 'node:assert/strict';
import {
  computeMemberGlobalStatus,
  filterExpiredMembersClean,
  resolveLatestMemberNote,
} from './memberLifecycle';
import { Client } from '../types';

const refDate = new Date('2026-10-25T12:00:00Z');

console.log('Running Member Lifecycle & Global Status Engine tests...');

// Test 1: Active member who previously had an expired package and renewed
// (The Critical Bug: `packages[0]` is Expired, `packages[1]` is Active)
{
  const renewedMember: Partial<Client> = {
    id: 'm-renewed-1',
    name: 'Ahmed Renewed',
    status: 'Expired', // Even if stale top-level status says Expired!
    packages: [
      {
        id: 'pkg-old',
        packageId: 'p1',
        packageName: '3 Months Membership',
        hierarchyType: 'Primary',
        status: 'Expired',
        startDate: '2025-01-01',
        endDate: '2025-04-01',
        totalSessions: 90,
        sessionsRemaining: 0,
      },
      {
        id: 'pkg-new',
        packageId: 'p2',
        packageName: '12 Months Annual Membership',
        hierarchyType: 'Primary',
        status: 'Active',
        subscriptionType: 'renewal',
        startDate: '2026-05-01',
        endDate: '2027-05-01',
        totalSessions: 365,
        sessionsRemaining: 200,
      },
    ],
  };

  const evalResult = computeMemberGlobalStatus(renewedMember, refDate);
  assert.equal(evalResult.globalStatus, 'ACTIVE', 'Renewed member must have ACTIVE global status');
  assert.equal(evalResult.hasActiveOrUpcomingPackage, true);
  assert.equal(evalResult.hasActiveRenewal, true);
  assert.equal(evalResult.isRenewedFromExpired, true);
  assert.equal(
    evalResult.effectivePrimaryPackage?.packageName,
    '12 Months Annual Membership',
    'Must select the active renewal package, not packages[0]'
  );
  assert.equal(evalResult.latestPackageEndDate, '2027-05-01');
  assert.ok(evalResult.daysRemaining > 180);
}

// Test 2: Truly expired member who had 2 historical packages (both expired in the past)
// Previously `pkgs.length > 1` or `subscriptionType === 'renewal'` falsely marked them as `hasActiveRenewal = true`!
{
  const multiExpiredMember: Partial<Client> = {
    id: 'm-expired-2',
    name: 'Sara Multi-Expired',
    status: 'Expired',
    packages: [
      {
        id: 'pkg-2024',
        packageId: 'p1',
        packageName: '1 Month Membership',
        hierarchyType: 'Primary',
        status: 'Expired',
        startDate: '2024-01-01',
        endDate: '2024-02-01',
        totalSessions: 30,
        sessionsRemaining: 0,
      },
      {
        id: 'pkg-2025',
        packageId: 'p2',
        packageName: '3 Months Membership',
        hierarchyType: 'Primary',
        status: 'Expired',
        subscriptionType: 'renewal',
        startDate: '2025-02-01',
        endDate: '2025-05-01',
        totalSessions: 90,
        sessionsRemaining: 0,
      },
    ],
  };

  const evalResult = computeMemberGlobalStatus(multiExpiredMember, refDate);
  assert.equal(evalResult.globalStatus, 'EXPIRED');
  assert.equal(evalResult.hasActiveOrUpcomingPackage, false);
  assert.equal(
    evalResult.hasActiveRenewal,
    false,
    'Member whose historical renewal also expired must have hasActiveRenewal === false'
  );
  assert.equal(
    evalResult.effectivePrimaryPackage?.packageName,
    '3 Months Membership',
    'Must select the most recent expired package (MAX(endDate)), not packages[0]'
  );
  assert.equal(evalResult.latestPackageEndDate, '2025-05-01');
  assert.ok(evalResult.daysRemaining < 0);
}

// Test 3: Member expiring within 7 days -> EXPIRING_SOON (still active, excluded from Expired list)
{
  const nearlyExpiredMember: Partial<Client> = {
    id: 'm-expiring-soon',
    name: 'Karim Expiring Soon',
    status: 'Active',
    packages: [
      {
        id: 'pkg-soon',
        packageId: 'p1',
        packageName: '1 Month Membership',
        hierarchyType: 'Primary',
        status: 'Active',
        startDate: '2026-09-28',
        endDate: '2026-10-28',
        totalSessions: 30,
        sessionsRemaining: 3,
      },
    ],
  };

  const evalResult = computeMemberGlobalStatus(nearlyExpiredMember, refDate);
  assert.equal(evalResult.globalStatus, 'EXPIRING_SOON');
  assert.equal(evalResult.hasActiveOrUpcomingPackage, true);
  assert.equal(evalResult.daysRemaining, 3);
}

// Test 4: Member on Hold / Frozen -> HOLD (excluded from Expired list)
{
  const holdMember: Partial<Client> = {
    id: 'm-hold',
    name: 'Nour On Hold',
    status: 'Hold',
    packages: [
      {
        id: 'pkg-hold',
        packageId: 'p1',
        packageName: '6 Months Membership',
        hierarchyType: 'Primary',
        status: 'Frozen',
        startDate: '2026-08-01',
        endDate: '2027-02-01',
        totalSessions: 180,
        sessionsRemaining: 120,
      },
    ],
  };

  const evalResult = computeMemberGlobalStatus(holdMember, refDate);
  assert.equal(evalResult.globalStatus, 'HOLD');
  assert.equal(evalResult.hasActiveOrUpcomingPackage, true);
}

// Test 5: Guest Member (registered Lead with 0 paid packages) -> GUEST
{
  const guestMember: Partial<Client> = {
    id: 'm-guest',
    name: 'Youssef Guest',
    status: 'Lead',
    paid: false,
    packageType: 'Prospect',
  };

  const evalResult = computeMemberGlobalStatus(guestMember, refDate);
  assert.equal(evalResult.globalStatus, 'GUEST');
  assert.equal(evalResult.hasActiveOrUpcomingPackage, false);
  assert.equal(evalResult.totalValidPackages, 0);
}

// Test 6: `filterExpiredMembersClean` strictly purges renewed/active/hold/guest members
// and filters by `latestPackageEndDate` within date range [2000-01-01, 2026-10-25]
{
  const sampleClients: Array<Partial<Client>> = [
    {
      id: 'c-renewed',
      name: 'Renewed Member',
      status: 'Active',
      packages: [
        {
          id: 'p1',
          packageId: 'pkg1',
          packageName: '1 Month',
          status: 'Expired',
          startDate: '2025-01-01',
          endDate: '2025-02-01',
          totalSessions: 30,
          sessionsRemaining: 0,
        },
        {
          id: 'p2',
          packageId: 'pkg2',
          packageName: '1 Year',
          status: 'Active',
          startDate: '2026-01-01',
          endDate: '2027-01-01',
          totalSessions: 365,
          sessionsRemaining: 100,
        },
      ],
    },
    {
      id: 'c-truly-expired-2025',
      name: 'Truly Expired 2025',
      status: 'Expired',
      packages: [
        {
          id: 'p3',
          packageId: 'pkg3',
          packageName: '3 Months',
          status: 'Expired',
          startDate: '2025-03-01',
          endDate: '2025-06-01',
          totalSessions: 90,
          sessionsRemaining: 0,
        },
      ],
    },
    {
      id: 'c-truly-expired-2026',
      name: 'Truly Expired 2026',
      status: 'Expired',
      packages: [
        {
          id: 'p4',
          packageId: 'pkg4',
          packageName: '6 Months',
          status: 'Expired',
          startDate: '2026-01-01',
          endDate: '2026-07-01',
          totalSessions: 180,
          sessionsRemaining: 0,
        },
      ],
    },
    {
      id: 'c-guest',
      name: 'Unpaid Guest',
      status: 'Lead',
      paid: false,
    },
  ];

  const cleanExpiredAll = filterExpiredMembersClean(sampleClients, {
    dateFrom: '2000-01-01',
    dateTo: '2026-10-25',
    includeRenewed: false,
    referenceDate: refDate,
  });

  assert.equal(cleanExpiredAll.length, 2, 'Only the 2 truly expired members should be returned');
  assert.deepEqual(
    cleanExpiredAll.map((r) => r.client.id),
    ['c-truly-expired-2026', 'c-truly-expired-2025'],
    'Should be sorted by latestPackageEndDate DESC and exclude renewed & guest members'
  );

  // Filter strictly for 2026 expirations
  const cleanExpired2026Only = filterExpiredMembersClean(sampleClients, {
    dateFrom: '2026-01-01',
    dateTo: '2026-10-25',
    includeRenewed: false,
    referenceDate: refDate,
  });
  assert.equal(cleanExpired2026Only.length, 1);
  assert.equal(cleanExpired2026Only[0]?.client.id, 'c-truly-expired-2026');
}

// Test 7: Latest comment / call note resolution
{
  const memberWithNotes: Partial<Client> = {
    id: 'm-notes',
    name: 'Mona Traveling',
    status: 'Active',
    lastCall: {
      text: 'Called regarding PT package',
      date: '2026-10-10T10:00:00Z',
      author: 'Omar Sales',
      outcome: 'Follow Up',
    },
    lastComment: {
      text: 'Member is traveling abroad until December, will not renew this month',
      date: '2026-10-20T15:30:00Z',
      author: 'Nadia CRM',
    },
    nextReminderDate: '2026-12-05',
  };

  const note = resolveLatestMemberNote(memberWithNotes);
  assert.equal(
    note.text,
    'Member is traveling abroad until December, will not renew this month',
    'Should surface the newest comment/note across call & comment channels'
  );
  assert.equal(note.author, 'Nadia CRM');
  assert.equal(note.source, 'comment');
  assert.equal(note.nextFollowUp, '2026-12-05');
}

console.log('All Member Lifecycle & Global Status Engine tests passed!');
