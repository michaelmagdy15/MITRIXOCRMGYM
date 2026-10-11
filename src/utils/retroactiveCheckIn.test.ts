import test from 'node:test';
import assert from 'node:assert/strict';
import {
  processRetroactiveAttendanceTransition,
  authorizeRetroactiveCheckIn,
  isStaffRole,
  SessionRecord,
  MemberRecord
} from './retroactiveCheckIn';

test('Retroactive Attendance Check-In & Paper Reconciliation Engine', async (t) => {
  // Helper dates
  const today = new Date();
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const threeDaysAgoStr = threeDaysAgo.toISOString().substring(0, 10);

  const baseSession3DaysOld: SessionRecord = {
    id: 'sess_past_001',
    name: 'Boxing Conditioning',
    date: threeDaysAgoStr,
    timeSlot: '21:00 - 22:00',
    startTime: `${threeDaysAgoStr}T21:00:00.000Z`,
    endTime: `${threeDaysAgoStr}T22:00:00.000Z`,
    branch: 'Maxim Compound',
    instructorId: 'coach_john',
    capacity: 20,
    attendees: ['mem_ahmed_123'],
    checkedIn: [],
    noShows: []
  };

  const baseMember: MemberRecord = {
    id: 'mem_ahmed_123',
    name: 'Ahmed Sherif',
    email: 'ahmed@example.com',
    phone: '+201000000001',
    sessionsRemaining: 8,
    activePackage: {
      id: 'pkg_active_88',
      name: 'Monthly 12-Class Pass',
      creditsLeft: 8,
      usedCredits: 4,
      status: 'active'
    },
    noShowStrikes: 0,
    bookingBlockedUntil: null
  };

  await t.test('1. Staff marking a 3-day-old session attendee as attended succeeds and updates audit logs', () => {
    const requesterStaff = {
      id: 'staff_reception_01',
      name: 'Sarah Receptionist',
      role: 'staff'
    };

    const result = processRetroactiveAttendanceTransition({
      session: { ...baseSession3DaysOld },
      member: { ...baseMember },
      requesterUser: requesterStaff,
      reason: 'Physical paper roster signed Thursday evening',
      isPreBooked: true
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 200);
    assert.equal(result.message, 'Retroactive attendance recorded successfully.');

    // Verifies past session attendee is marked attended
    assert.ok(result.sessionUpdates.checkedIn?.includes('mem_ahmed_123'));
    const attendeeRecord = result.sessionUpdates.attendeeRecords?.['mem_ahmed_123'];
    assert.ok(attendeeRecord);
    assert.equal(attendeeRecord?.status, 'ATTENDED');
    assert.equal(attendeeRecord?.checkInType, 'RETROACTIVE');
    assert.equal(attendeeRecord?.checkedInBy, 'staff_reception_01');
    assert.equal(attendeeRecord?.notes, 'Physical paper roster signed Thursday evening');

    // Verifies audit log structure
    const audit = result.auditLog;
    assert.ok(audit, 'Audit log entry must be generated');
    assert.equal(audit?.sessionId, 'sess_past_001');
    assert.equal(audit?.sessionDate, threeDaysAgoStr);
    assert.equal(audit?.sessionTime, '21:00 - 22:00');
    assert.equal(audit?.memberId, 'mem_ahmed_123');
    assert.equal(audit?.memberName, 'Ahmed Sherif');
    assert.equal(audit?.performedBy, 'staff_reception_01');
    assert.equal(audit?.action, 'RETROACTIVE_CHECK_IN');
    assert.equal(audit?.previousStatus, 'BOOKED');
    assert.equal(audit?.newStatus, 'ATTENDED');
    assert.equal(audit?.checkInType, 'RETROACTIVE');
  });

  await t.test('2. Prevent double credit deduction if credit was already debited during booking creation', () => {
    const requesterManager = {
      id: 'mgr_omar_01',
      name: 'Omar Branch Manager',
      role: 'manager'
    };

    const initialCredits = baseMember.sessionsRemaining; // 8

    // Attendee is already listed in session.attendees (pre-booked)
    const result1 = processRetroactiveAttendanceTransition({
      session: { ...baseSession3DaysOld, attendees: ['mem_ahmed_123'] },
      member: { ...baseMember },
      requesterUser: requesterManager,
      reason: 'Paper roster reconciliation'
    });

    assert.equal(result1.success, true);
    assert.equal(result1.creditsDeducted, false, 'Pre-booked member token was already consumed at booking time');
    assert.equal(result1.remainingCredits, initialCredits, 'Credits balance must not change');
    assert.equal(result1.memberUpdates.sessionsRemaining, initialCredits);

    // Call a second time (idempotency check)
    const updatedSession: SessionRecord = {
      ...baseSession3DaysOld,
      checkedIn: ['mem_ahmed_123'],
      attendeeRecords: {
        'mem_ahmed_123': {
          memberId: 'mem_ahmed_123',
          status: 'ATTENDED',
          checkInType: 'RETROACTIVE'
        }
      }
    };

    const result2 = processRetroactiveAttendanceTransition({
      session: updatedSession,
      member: { ...baseMember },
      requesterUser: requesterManager,
      reason: 'Duplicate click check'
    });

    assert.equal(result2.success, true);
    assert.equal(result2.alreadyAttended, true, 'Subsequent checks should return already attended idempotently');
    assert.equal(result2.creditsDeducted, false, 'Duplicate call must never deduct credits');
    assert.equal(result2.remainingCredits, initialCredits);
  });

  await t.test('3. Reject unauthorized client-app attempts to call retroactive check-in endpoints (HTTP 403)', () => {
    const clientRequester = {
      id: 'client_hacker_99',
      name: 'Malicious Client User',
      role: 'client'
    };

    // Client role check
    const authCheck = authorizeRetroactiveCheckIn(clientRequester.role);
    assert.equal(authCheck.allowed, false);
    assert.equal(authCheck.status, 403);

    // Attempt retroactive check-in as client
    const result = processRetroactiveAttendanceTransition({
      session: { ...baseSession3DaysOld },
      member: { ...baseMember },
      requesterUser: clientRequester,
      reason: 'Attempting to self-verify attendance'
    });

    assert.equal(result.success, false);
    assert.equal(result.status, 403);
    assert.ok(result.message.includes('Forbidden'));
    assert.equal(result.creditsDeducted, false);
    assert.deepEqual(result.sessionUpdates, {});
    assert.deepEqual(result.memberUpdates, {});
    assert.equal(result.auditLog, undefined, 'No audit log should be created for rejected requests');
  });

  await t.test('4. Walk-in attendee without pre-booking decrements credit balance by 1', () => {
    const staffRequester = {
      id: 'staff_frontdesk_02',
      name: 'Nour Receptionist',
      role: 'staff'
    };

    // Walk-in attendee not in session.attendees
    const walkInSession: SessionRecord = {
      ...baseSession3DaysOld,
      attendees: [] // Not pre-booked
    };

    const result = processRetroactiveAttendanceTransition({
      session: walkInSession,
      member: { ...baseMember, sessionsRemaining: 5 },
      requesterUser: staffRequester,
      reason: 'Walk-in paper attendance manual reconciliation'
    });

    assert.equal(result.success, true);
    assert.equal(result.creditsDeducted, true, 'Walk-in must consume 1 package credit');
    assert.equal(result.remainingCredits, 4);
    assert.equal(result.memberUpdates.sessionsRemaining, 4);
    assert.equal(result.memberUpdates.activePackage?.creditsLeft, 4);
    assert.equal(result.auditLog?.previousStatus, 'UNMARKED');
  });

  await t.test('5. Reconciling a falsely-marked No-Show forgives strikes and restores attendance', () => {
    const managerRequester = {
      id: 'mgr_01',
      name: 'General Manager',
      role: 'admin'
    };

    const sessionWithNoShow: SessionRecord = {
      ...baseSession3DaysOld,
      attendees: ['mem_ahmed_123'],
      noShows: ['mem_ahmed_123']
    };

    const penalizedMember: MemberRecord = {
      ...baseMember,
      noShowStrikes: 1,
      bookingBlockedUntil: null
    };

    const result = processRetroactiveAttendanceTransition({
      session: sessionWithNoShow,
      member: penalizedMember,
      requesterUser: managerRequester,
      reason: 'Paper sheet proved member attended 9PM class'
    });

    assert.equal(result.success, true);
    assert.ok(!result.sessionUpdates.noShows?.includes('mem_ahmed_123'), 'Must be removed from noShows list');
    assert.ok(result.sessionUpdates.checkedIn?.includes('mem_ahmed_123'), 'Must be added to checkedIn list');
    assert.equal(result.memberUpdates.noShowStrikes, 0, 'No-show strike must be forgiven');
    assert.equal(result.auditLog?.previousStatus, 'NO_SHOW');
    assert.equal(result.auditLog?.newStatus, 'ATTENDED');
  });
});
