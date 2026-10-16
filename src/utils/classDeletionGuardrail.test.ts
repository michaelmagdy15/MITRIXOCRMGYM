import { describe, it } from 'node:test';
import assert from 'node:assert';
import { canDeleteClassSession } from './classDeletionGuardrail';

describe('canDeleteClassSession', () => {
  it('allows deletion when class session is undefined or null', () => {
    assert.deepStrictEqual(canDeleteClassSession(undefined), {
      allowed: true,
      activeBookingsCount: 0,
      waitlistCount: 0,
      totalBlockingCount: 0,
    });

    assert.deepStrictEqual(canDeleteClassSession(null), {
      allowed: true,
      activeBookingsCount: 0,
      waitlistCount: 0,
      totalBlockingCount: 0,
    });
  });

  it('allows deletion when attendees and waitlist are empty or omitted', () => {
    assert.deepStrictEqual(canDeleteClassSession({ id: 'cls-1', name: 'Boxing 101' }), {
      allowed: true,
      activeBookingsCount: 0,
      waitlistCount: 0,
      totalBlockingCount: 0,
    });

    assert.deepStrictEqual(canDeleteClassSession({ id: 'cls-1', attendees: [], waitlist: [] }), {
      allowed: true,
      activeBookingsCount: 0,
      waitlistCount: 0,
      totalBlockingCount: 0,
    });
  });

  it('blocks deletion when class session has active attendees only', () => {
    const result = canDeleteClassSession({
      id: 'cls-2',
      attendees: ['member-1', 'member-2'],
      waitlist: [],
    });

    assert.deepStrictEqual(result, {
      allowed: false,
      activeBookingsCount: 2,
      waitlistCount: 0,
      totalBlockingCount: 2,
      reason:
        'Cannot delete this class session while 2 attending member(s) are still booked. Please remove/clear all member bookings from the roster first.',
    });
  });

  it('blocks deletion when class session has waitlisted members only', () => {
    const result = canDeleteClassSession({
      id: 'cls-3',
      attendees: [],
      waitlist: ['member-3'],
    });

    assert.deepStrictEqual(result, {
      allowed: false,
      activeBookingsCount: 0,
      waitlistCount: 1,
      totalBlockingCount: 1,
      reason:
        'Cannot delete this class session while 0 attending member(s) and 1 waitlisted member(s) are still booked. Please remove/clear all member bookings from the roster first.',
    });
  });

  it('blocks deletion when class session has both active attendees and waitlisted members', () => {
    const result = canDeleteClassSession({
      id: 'cls-4',
      attendees: ['member-1', 'member-2', 'member-3'],
      waitlist: ['member-4', 'member-5'],
    });

    assert.deepStrictEqual(result, {
      allowed: false,
      activeBookingsCount: 3,
      waitlistCount: 2,
      totalBlockingCount: 5,
      reason:
        'Cannot delete this class session while 3 attending member(s) and 2 waitlisted member(s) are still booked. Please remove/clear all member bookings from the roster first.',
    });
  });
});
