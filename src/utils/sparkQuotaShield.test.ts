import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __clearAllQuotaMetersForTests,
  getNextPacificMidnightIso,
  getPacificDateKey,
  getQuotaAlertHistory,
  getQuotaStatus,
  isQuotaShieldActive,
  markQuotaExhausted,
  onQuotaStateTransition,
  recordFirestoreReads,
  recordFirestoreWrites,
  resetQuotaShieldProbe,
  shouldDeferBackgroundJob,
  SPARK_CONSERVE_READ_THRESHOLD,
  SPARK_SHIELD_READ_THRESHOLD,
} from './sparkQuotaShield';

test('sparkQuotaShield computes Pacific date keys and next Pacific midnight cleanly', () => {
  // 2026-11-19T07:59:59Z is 2026-11-18T23:59:59 PST (-08:00)
  const justBeforeReset = new Date('2026-11-19T07:59:59.000Z');
  assert.equal(getPacificDateKey(justBeforeReset), '2026-11-18');
  assert.equal(getNextPacificMidnightIso(justBeforeReset), '2026-11-19T08:00:00.000Z');

  // 2026-11-19T08:00:01Z is 2026-11-19T00:00:01 PST (-08:00)
  const justAfterReset = new Date('2026-11-19T08:00:01.000Z');
  assert.equal(getPacificDateKey(justAfterReset), '2026-11-19');
  assert.equal(getNextPacificMidnightIso(justAfterReset), '2026-11-20T08:00:00.000Z');

  // 2026-07-15T06:30:00Z is 2026-07-14T23:30:00 PDT (-07:00)
  const summerPdt = new Date('2026-07-15T06:30:00.000Z');
  assert.equal(getPacificDateKey(summerPdt), '2026-07-14');
  assert.equal(getNextPacificMidnightIso(summerPdt), '2026-07-15T07:00:00.000Z');
});

test('sparkQuotaShield enforces state transitions, tenant isolation, and probe reset', () => {
  __clearAllQuotaMetersForTests();
  const now = new Date('2026-11-19T12:00:00.000Z');

  assert.equal(getQuotaStatus('inzanathletics', now).state, 'normal');
  assert.equal(shouldDeferBackgroundJob('inzanathletics', now), false);
  assert.equal(isQuotaShieldActive('inzanathletics', now), false);

  recordFirestoreReads('inzanathletics', SPARK_CONSERVE_READ_THRESHOLD, now);
  assert.equal(getQuotaStatus('inzanathletics', now).state, 'conserve');
  assert.equal(shouldDeferBackgroundJob('inzanathletics', now), true);
  assert.equal(isQuotaShieldActive('inzanathletics', now), false);

  // Strike tenant remains isolated and unaffected
  assert.equal(getQuotaStatus('strike', now).state, 'normal');

  recordFirestoreReads('inzanathletics', SPARK_SHIELD_READ_THRESHOLD - SPARK_CONSERVE_READ_THRESHOLD, now);
  assert.equal(getQuotaStatus('inzanathletics', now).state, 'shield_active');
  assert.equal(isQuotaShieldActive('inzanathletics', now), true);

  // Write threshold independently transitions a tenant to conserve / shield
  recordFirestoreWrites('vbt', 14_500, now);
  assert.equal(getQuotaStatus('vbt', now).state, 'conserve');
  recordFirestoreWrites('vbt', 4_000, now);
  assert.equal(getQuotaStatus('vbt', now).state, 'shield_active');

  // Explicit exhaustion latch & manual admin probe reset
  markQuotaExhausted('vbt', '8 RESOURCE_EXHAUSTED: Quota exceeded.', now);
  assert.equal(getQuotaStatus('vbt', now).exhaustedLatch, true);
  assert.equal(isQuotaShieldActive('vbt', now), true);

  const probed = resetQuotaShieldProbe('vbt', now);
  assert.equal(probed.exhaustedLatch, false);
  assert.equal(probed.state, 'normal');

  // Rolls over automatically at next Pacific midnight
  const rolled = getQuotaStatus('inzanathletics', new Date('2026-11-20T08:05:00.000Z'));
  assert.equal(rolled.reads, 0);
  assert.equal(rolled.state, 'normal');
});

test('sparkQuotaShield emits non-duplicated state transition alerts and stores ring-buffer history', () => {
  __clearAllQuotaMetersForTests();
  const now = new Date('2026-11-19T14:00:00.000Z');
  const received: Array<{ fromState: string; toState: string; tenantId: string }> = [];

  const unsub = onQuotaStateTransition((alert) => {
    received.push({ fromState: alert.fromState, toState: alert.toState, tenantId: alert.tenantId });
  });

  try {
    // Sub-threshold reads produce no alerts
    recordFirestoreReads('inzanathletics', 500, now);
    assert.equal(received.length, 0);

    // Crossing conserve fires once
    recordFirestoreReads('inzanathletics', SPARK_CONSERVE_READ_THRESHOLD, now);
    assert.equal(received.length, 1);
    assert.deepEqual(received[0], {
      fromState: 'normal',
      toState: 'conserve',
      tenantId: 'inzanathletics',
    });

    // Additional reads still inside conserve do NOT spam duplicate alerts
    recordFirestoreReads('inzanathletics', 500, now);
    assert.equal(received.length, 1);

    // Crossing shield_active fires once
    recordFirestoreReads('inzanathletics', SPARK_SHIELD_READ_THRESHOLD, now);
    assert.equal(received.length, 2);
    assert.deepEqual(received[1], {
      fromState: 'conserve',
      toState: 'shield_active',
      tenantId: 'inzanathletics',
    });

    // Duplicate exhaustion latch while already in shield_active does NOT emit another alert
    markQuotaExhausted('inzanathletics', 'Quota exceeded', now);
    assert.equal(received.length, 2);

    const history = getQuotaAlertHistory('inzanathletics', now);
    assert.equal(history.length, 2);
    assert.equal(history[0]?.toState, 'shield_active');
    assert.equal(history[1]?.toState, 'conserve');
  } finally {
    unsub();
  }
});
