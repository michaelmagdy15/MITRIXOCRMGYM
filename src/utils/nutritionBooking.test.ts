import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  timeToMinutes,
  minutesToTime,
  generateSlotBucketKeys,
  validateNutritionSlotRules
} from './nutritionBooking';

console.log('Running Nutrition Booking unit tests...');

// 1. Time conversions
(() => {
  assert.strictEqual(timeToMinutes('00:00'), 0);
  assert.strictEqual(timeToMinutes('10:30'), 630);
  assert.strictEqual(timeToMinutes('23:45'), 1425);
  assert.strictEqual(minutesToTime(0), '00:00');
  assert.strictEqual(minutesToTime(630), '10:30');
  assert.strictEqual(minutesToTime(1425), '23:45');
  console.log('  ✓ Time conversion tests passed');
})();

// 2. Bucket generation
(() => {
  const keys = generateSlotBucketKeys('dr_sarah', '2026-10-10', '10:00', '10:45');
  assert.deepStrictEqual(keys, [
    'dr_sarah_2026-10-10_10:00',
    'dr_sarah_2026-10-10_10:15',
    'dr_sarah_2026-10-10_10:30'
  ]);

  // Partial overlap test
  const keysOverlap = generateSlotBucketKeys('dr_sarah', '2026-10-10', '10:30', '11:15');
  const sharedKey = keys.find((k) => keysOverlap.includes(k));
  assert.strictEqual(sharedKey, 'dr_sarah_2026-10-10_10:30', 'Should detect exact shared 15-minute slot key');
  console.log('  ✓ Deterministic bucket generation and overlap collision keys passed');
})();

// 3. Validation - Active / Inactive nutritionist
(() => {
  assert.throws(
    () => {
      validateNutritionSlotRules({
        nutritionistId: 'dr_sarah',
        date: '2026-10-15',
        startTime: '10:00',
        endTime: '10:45',
        active: false,
        now: new Date('2026-10-01T00:00:00')
      });
    },
    /Selected nutritionist is not currently active/,
    'Inactive nutritionist must be rejected'
  );
  console.log('  ✓ Inactive nutritionist rejected');
})();

// 4. Validation - Past date rejection
(() => {
  assert.throws(
    () => {
      validateNutritionSlotRules({
        nutritionistId: 'dr_sarah',
        date: '2026-10-01',
        startTime: '09:00',
        endTime: '09:45',
        active: true,
        now: new Date('2026-10-05T00:00:00')
      });
    },
    /Cannot book an appointment in the past/,
    'Past booking must be rejected'
  );
  console.log('  ✓ Booking in the past rejected');
})();

// 5. Validation - Working schedule and day enabled
(() => {
  const schedule = {
    Monday: { enabled: true, startTime: '09:00', endTime: '17:00' },
    Friday: { enabled: false, startTime: '09:00', endTime: '17:00' }
  };

  // 2026-10-16 is a Friday
  assert.throws(
    () => {
      validateNutritionSlotRules({
        nutritionistId: 'dr_sarah',
        date: '2026-10-16',
        startTime: '10:00',
        endTime: '10:45',
        schedule,
        active: true,
        now: new Date('2026-10-01T00:00:00')
      });
    },
    /Nutritionist is not available on Fridays/,
    'Disabled day must be rejected'
  );

  // 2026-10-12 is a Monday, but time is outside hours (18:00)
  assert.throws(
    () => {
      validateNutritionSlotRules({
        nutritionistId: 'dr_sarah',
        date: '2026-10-12',
        startTime: '17:00',
        endTime: '17:45',
        schedule,
        active: true,
        now: new Date('2026-10-01T00:00:00')
      });
    },
    /falls outside working hours/,
    'Outside working hours must be rejected'
  );

  // Valid appointment within Monday hours
  assert.doesNotThrow(() => {
    validateNutritionSlotRules({
      nutritionistId: 'dr_sarah',
      date: '2026-10-12',
      startTime: '11:00',
      endTime: '11:45',
      schedule,
      active: true,
      now: new Date('2026-10-01T00:00:00')
    });
  });

  console.log('  ✓ Working schedule boundaries enforced');
})();

console.log('All Nutrition Booking unit tests passed successfully! ✅');
