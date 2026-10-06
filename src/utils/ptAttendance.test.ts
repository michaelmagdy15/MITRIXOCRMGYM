import assert from 'node:assert';
import {
  calculatePTBalanceTransition,
  ClientPTSnapshot,
  PTSessionSnapshot
} from './ptAttendance';

console.log('Running PT Attendance & Deduction unit tests...');

const baseClient: ClientPTSnapshot = {
  id: 'client_123',
  name: 'Ahmed Sherif',
  sessionsRemaining: 10,
  usedSessions: 2,
  packages: [
    {
      id: 'pkg_pt_1',
      name: '12 PT Sessions Pack',
      isPT: true,
      sessionsTotal: 12,
      sessionsRemaining: 10,
      usedSessions: 2,
      status: 'active'
    }
  ]
};

// 1. Scheduled -> Attended (Deduct 1 token)
(() => {
  const session: PTSessionSnapshot = {
    id: 'sess_1',
    clientId: 'client_123',
    date: '2026-10-10',
    time: '14:00',
    status: 'Scheduled'
  };

  const result = calculatePTBalanceTransition(session, 'Attended', baseClient);
  assert.strictEqual(result.action, 'deducted');
  assert.strictEqual(result.clientUpdates.sessionsRemaining, 9);
  assert.strictEqual(result.clientUpdates.usedSessions, 3);
  assert.strictEqual(result.clientUpdates.packages?.[0]?.sessionsRemaining, 9);
  assert.strictEqual(result.clientUpdates.packages?.[0]?.usedSessions, 3);
  console.log('  ✓ Scheduled -> Attended deducted 1 token from client and package');
})();

// 2. Scheduled -> No Show (Deduct 1 token per gym policy)
(() => {
  const session: PTSessionSnapshot = {
    id: 'sess_1',
    clientId: 'client_123',
    date: '2026-10-10',
    time: '14:00',
    status: 'Scheduled'
  };

  const result = calculatePTBalanceTransition(session, 'No Show', baseClient);
  assert.strictEqual(result.action, 'deducted');
  assert.strictEqual(result.clientUpdates.sessionsRemaining, 9);
  assert.strictEqual(result.clientUpdates.usedSessions, 3);
  console.log('  ✓ Scheduled -> No Show deducted 1 token');
})();

// 3. Scheduled -> Advance Cancellation (> 12h notice, token preserved)
(() => {
  const session: PTSessionSnapshot = {
    id: 'sess_1',
    clientId: 'client_123',
    date: '2026-10-10',
    time: '14:00',
    status: 'Scheduled'
  };

  // Now is 2026-10-08 (more than 12h before)
  const now = new Date('2026-10-08T10:00:00');
  const result = calculatePTBalanceTransition(session, 'Cancelled', baseClient, now);
  assert.strictEqual(result.action, 'unchanged');
  assert.strictEqual(Object.keys(result.clientUpdates).length, 0);
  console.log('  ✓ Advance cancellation (>12h) preserved token unchanged');
})();

// 4. Scheduled -> Late Cancellation (< 12h notice, token forfeited)
(() => {
  const session: PTSessionSnapshot = {
    id: 'sess_1',
    clientId: 'client_123',
    date: '2026-10-10',
    time: '14:00',
    status: 'Scheduled'
  };

  // Now is 2026-10-10 11:00 (only 3h notice)
  const now = new Date('2026-10-10T11:00:00');
  const result = calculatePTBalanceTransition(session, 'Cancelled', baseClient, now);
  assert.strictEqual(result.action, 'forfeited_late_cancel');
  assert.strictEqual(result.clientUpdates.sessionsRemaining, 9);
  assert.strictEqual(result.clientUpdates.usedSessions, 3);
  console.log('  ✓ Late cancellation (<12h) forfeited 1 token');
})();

// 5. Attended -> Revert to Scheduled (Token restored)
(() => {
  const session: PTSessionSnapshot = {
    id: 'sess_1',
    clientId: 'client_123',
    date: '2026-10-10',
    time: '14:00',
    status: 'Attended'
  };

  const clientWithDeduction: ClientPTSnapshot = {
    ...baseClient,
    sessionsRemaining: 9,
    usedSessions: 3,
    packages: [
      {
        ...baseClient.packages![0]!,
        sessionsRemaining: 9,
        usedSessions: 3
      }
    ]
  };

  const result = calculatePTBalanceTransition(session, 'Scheduled', clientWithDeduction);
  assert.strictEqual(result.action, 'restored');
  assert.strictEqual(result.clientUpdates.sessionsRemaining, 10);
  assert.strictEqual(result.clientUpdates.usedSessions, 2);
  assert.strictEqual(result.clientUpdates.packages?.[0]?.sessionsRemaining, 10);
  assert.strictEqual(result.clientUpdates.packages?.[0]?.usedSessions, 2);
  console.log('  ✓ Attended -> Scheduled restored 1 token');
})();

// 6. Unlimited package handling
(() => {
  const unlimitedClient: ClientPTSnapshot = {
    id: 'client_unlimited',
    name: 'VIP Client',
    sessionsRemaining: 'unlimited',
    usedSessions: 15,
    packages: [
      {
        id: 'pkg_vip',
        name: 'VIP Unlimited PT',
        isPT: true,
        sessionsTotal: 'unlimited',
        usedSessions: 15,
        status: 'active'
      }
    ]
  };

  const session: PTSessionSnapshot = {
    id: 'sess_vip',
    clientId: 'client_unlimited',
    date: '2026-10-10',
    time: '14:00',
    status: 'Scheduled'
  };

  const result = calculatePTBalanceTransition(session, 'Attended', unlimitedClient);
  assert.strictEqual(result.action, 'deducted');
  assert.strictEqual(result.clientUpdates.sessionsRemaining, 'unlimited');
  assert.strictEqual(result.clientUpdates.usedSessions, 16);
  console.log('  ✓ Unlimited package incremented usedSessions without altering unlimited remaining');
})();

console.log('All PT Attendance & Deduction unit tests passed successfully! ✅');
