import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GYM_DEFAULT_TIMEZONE,
  getGymDateString,
  getGymTimeString,
  getGymDateTimeParts,
  getGymLocalToUtcIso,
  getGymDayBoundaryUtc,
  toSafeIsoDateTime
} from './dateUtils';
import { validatePackageTimeWindow } from './membershipRules';
import { calculateShiftReconciliation } from './shiftReconciliation';
import { Payment } from '../types';

test('Egypt Winter Time (DST) & Timezone Shift Transition Test Suite', async (t) => {
  await t.test('1. Timezone offset transition on Oct 29, 2026 (UTC+3 Summer to UTC+2 Winter)', () => {
    // Before shift: 2026-10-29 18:00:00 UTC is 21:00:00 Cairo (UTC+3)
    const summerInstant = new Date('2026-10-29T18:00:00.000Z');
    const summerParts = getGymDateTimeParts(summerInstant, GYM_DEFAULT_TIMEZONE);
    assert.equal(summerParts.hours, 21);
    assert.equal(summerParts.dateStr, '2026-10-29');

    // After shift: 2026-10-30 08:00:00 UTC is 10:00:00 Cairo (UTC+2)
    const winterInstant = new Date('2026-10-30T08:00:00.000Z');
    const winterParts = getGymDateTimeParts(winterInstant, GYM_DEFAULT_TIMEZONE);
    assert.equal(winterParts.hours, 10);
    assert.equal(winterParts.dateStr, '2026-10-30');
  });

  await t.test('2. getGymDateString returns correct Cairo calendar day even when UTC is on different day', () => {
    // 12:30 AM on Oct 30 in Cairo (UTC+2) is 22:30 on Oct 29 in UTC!
    const earlyMorningCairo = new Date('2026-10-29T22:30:00.000Z');
    
    // In UTC, date is 2026-10-29
    assert.equal(earlyMorningCairo.toISOString().substring(0, 10), '2026-10-29');
    
    // In Cairo gym local timezone, date is correctly 2026-10-30!
    assert.equal(getGymDateString(earlyMorningCairo, GYM_DEFAULT_TIMEZONE), '2026-10-30');
  });

  await t.test('3. getGymDayBoundaryUtc calculates exact UTC boundaries across summer/winter', () => {
    // Summer date (Aug 15, 2026): UTC+3
    const summerStartUtc = getGymDayBoundaryUtc('2026-08-15', false, GYM_DEFAULT_TIMEZONE);
    assert.equal(summerStartUtc, '2026-08-14T21:00:00.000Z'); // 00:00 Cairo = 21:00 UTC previous day

    const summerEndUtc = getGymDayBoundaryUtc('2026-08-15', true, GYM_DEFAULT_TIMEZONE);
    assert.equal(summerEndUtc, '2026-08-15T20:59:59.999Z'); // 23:59:59.999 Cairo = 20:59:59.999 UTC

    // Winter date (Oct 30, 2026): UTC+2
    const winterStartUtc = getGymDayBoundaryUtc('2026-10-30', false, GYM_DEFAULT_TIMEZONE);
    assert.equal(winterStartUtc, '2026-10-29T22:00:00.000Z'); // 00:00 Cairo = 22:00 UTC previous day

    const winterEndUtc = getGymDayBoundaryUtc('2026-10-30', true, GYM_DEFAULT_TIMEZONE);
    assert.equal(winterEndUtc, '2026-10-30T21:59:59.999Z'); // 23:59:59.999 Cairo = 21:59:59.999 UTC
  });

  await t.test('4. getGymLocalToUtcIso accurately converts Cairo local class times to UTC instants', () => {
    // Class at 10:00 AM on summer date (Oct 25, 2026) -> 07:00 UTC
    const summerClassUtc = getGymLocalToUtcIso('2026-10-25', '10:00', GYM_DEFAULT_TIMEZONE);
    assert.equal(summerClassUtc, '2026-10-25T07:00:00.000Z');

    // Class at 10:00 AM on winter date (Oct 30, 2026) -> 08:00 UTC
    const winterClassUtc = getGymLocalToUtcIso('2026-10-30', '10:00', GYM_DEFAULT_TIMEZONE);
    assert.equal(winterClassUtc, '2026-10-30T08:00:00.000Z');
  });

  await t.test('5. validatePackageTimeWindow enforces local Cairo time windows in both summer & winter', () => {
    const morningPackage = {
      name: 'Morning Package',
      isTimeRestricted: true,
      allowedStartTime: '06:00',
      allowedEndTime: '14:00'
    };

    // Winter time: 07:00 Cairo is 05:00 UTC on 2026-10-30
    const winterMorningUtc = new Date('2026-10-30T05:00:00.000Z');
    const winterCheck = validatePackageTimeWindow(morningPackage, winterMorningUtc, GYM_DEFAULT_TIMEZONE);
    assert.equal(winterCheck.allowed, true);

    // Winter time: 15:00 Cairo is 13:00 UTC on 2026-10-30
    const winterAfternoonUtc = new Date('2026-10-30T13:00:00.000Z');
    const winterLateCheck = validatePackageTimeWindow(morningPackage, winterAfternoonUtc, GYM_DEFAULT_TIMEZONE);
    assert.equal(winterLateCheck.allowed, false);
    assert.match(winterLateCheck.reason || '', /06:00 and 14:00/);
  });

  await t.test('6. Shift Reconciliation accurately captures payments after midnight in Cairo', () => {
    // A payment made at 00:30 AM Cairo time on Oct 30 (UTC timestamp: 2026-10-29T22:30:00.000Z)
    const payments: Payment[] = [
      {
        id: 'pay_midnight_1',
        clientId: 'client_1',
        client_name: 'Ahmed',
        amount: 2500,
        amount_paid: 2500,
        date: '2026-10-29T22:30:00.000Z',
        method: 'Cash',
        branch: 'New Cairo'
      }
    ];

    const reportCairo = calculateShiftReconciliation(payments, {
      date: '2026-10-30',
      timezone: 'Africa/Cairo',
      declared: { cash: 2500 }
    });

    assert.equal(reportCairo.system.cash, 2500);
    assert.equal(reportCairo.status, 'Balanced');
  });
});
