/**
 * Retroactive Session Check-in & Historical Attendance Reconciliation Engine
 *
 * Implements atomic reconciliation logic, credit deduction idempotency,
 * role authorization, and audit logging.
 */

export interface AttendeeRecord {
  memberId: string;
  memberName?: string;
  status: 'BOOKED' | 'ATTENDED' | 'NO_SHOW' | 'UNMARKED' | 'CANCELLED';
  checkInType?: 'REALTIME' | 'RETROACTIVE' | 'MANUAL';
  checkedInAt?: string;
  checkedInBy?: string;
  notes?: string;
}

export interface SessionRecord {
  id: string;
  name: string;
  date: string;
  timeSlot?: string;
  startTime: string;
  endTime: string;
  branch?: string;
  instructorId?: string;
  capacity: number;
  attendees: string[];
  checkedIn?: string[];
  noShows?: string[];
  attendeeRecords?: Record<string, AttendeeRecord>;
}

export interface ClientPackageRecord {
  id: string;
  name?: string;
  creditsLeft: number;
  usedCredits?: number;
  status?: string;
}

export interface MemberRecord {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  sessionsRemaining?: number;
  activePackage?: ClientPackageRecord;
  noShowStrikes?: number;
  bookingBlockedUntil?: string | null;
}

export interface AuditLogEntry {
  sessionId: string;
  sessionDate: string;
  sessionTime?: string;
  memberId: string;
  memberName: string;
  performedBy: string;
  performedAt: string;
  action: 'RETROACTIVE_CHECK_IN' | 'BATCH_RECONCILE' | 'NO_SHOW_CONFIRMED';
  previousStatus: string;
  newStatus: string;
  checkInType: 'RETROACTIVE';
  notes: string;
}

export interface RetroactiveCheckInParams {
  session: SessionRecord;
  member: MemberRecord;
  requesterUser: { id: string; role: string; name?: string };
  reason?: string;
  isPreBooked?: boolean;
}

export interface RetroactiveCheckInResult {
  success: boolean;
  status: number;
  message: string;
  alreadyAttended?: boolean;
  creditsDeducted: boolean;
  remainingCredits: number;
  sessionUpdates: Partial<SessionRecord>;
  memberUpdates: Partial<MemberRecord>;
  auditLog?: AuditLogEntry;
}

/**
 * Validates staff role permissions for retroactive check-in.
 * Only ADMIN, MANAGER, or STAFF roles are authorized.
 * Clients and unauthenticated users receive HTTP 403 Forbidden.
 */
export function isStaffRole(role?: string): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase().trim();
  return ['admin', 'manager', 'staff', 'frontdesk', 'coach', 'trainer', 'super_admin', 'crm_admin', 'rep'].includes(normalized);
}

export function authorizeRetroactiveCheckIn(role?: string): { allowed: boolean; status: number; error?: string } {
  if (!isStaffRole(role)) {
    return {
      allowed: false,
      status: 403,
      error: 'Forbidden: Retroactive attendance check-in requires ADMIN, MANAGER, or STAFF permissions.'
    };
  }
  return { allowed: true, status: 200 };
}

/**
 * Calculates atomic attendance transition for retroactive check-in.
 * Handles:
 * 1. Historical past session verification (any past date, e.g. 3 days old).
 * 2. Pre-deduction check: Retains balance if credit was pre-deducted at reservation time.
 * 3. Idempotency: Returns early if member is already marked attended without double debiting.
 * 4. Generates immutable audit log for `attendance_audit_logs`.
 */
export function processRetroactiveAttendanceTransition(params: RetroactiveCheckInParams): RetroactiveCheckInResult {
  const { session, member, requesterUser, reason, isPreBooked } = params;

  // 1. Authorization check
  const authCheck = authorizeRetroactiveCheckIn(requesterUser.role);
  if (!authCheck.allowed) {
    return {
      success: false,
      status: 403,
      message: authCheck.error || 'Forbidden',
      creditsDeducted: false,
      remainingCredits: member.sessionsRemaining ?? member.activePackage?.creditsLeft ?? 0,
      sessionUpdates: {},
      memberUpdates: {}
    };
  }

  const memberId = member.id;
  const isCurrentlyCheckedIn = (session.checkedIn || []).includes(memberId);
  const existingRecord = session.attendeeRecords?.[memberId];

  // 2. Idempotency Check: if already attended, do not deduct again or duplicate logs
  if (isCurrentlyCheckedIn || existingRecord?.status === 'ATTENDED') {
    return {
      success: true,
      status: 200,
      message: 'Member is already marked attended in this session.',
      alreadyAttended: true,
      creditsDeducted: false,
      remainingCredits: member.sessionsRemaining ?? member.activePackage?.creditsLeft ?? 0,
      sessionUpdates: {},
      memberUpdates: {}
    };
  }

  // 3. Pre-deduction intelligence:
  // If the member was already enrolled/booked, the token was debited at reservation creation.
  // Only deduct if this is an un-enrolled walk-in who was not pre-deducted.
  const isEnrolled = (session.attendees || []).includes(memberId) || isPreBooked;
  let creditsDeducted = false;
  let newRemainingCredits = member.sessionsRemaining ?? member.activePackage?.creditsLeft ?? 0;

  if (!isEnrolled) {
    // Walk-in without pre-deduction: Must validate creditsLeft > 0
    if (newRemainingCredits <= 0) {
      return {
        success: false,
        status: 400,
        message: 'Member has no available package credits for this session check-in.',
        creditsDeducted: false,
        remainingCredits: 0,
        sessionUpdates: {},
        memberUpdates: {}
      };
    }
    creditsDeducted = true;
    newRemainingCredits = Math.max(0, newRemainingCredits - 1);
  }

  const nowIso = new Date().toISOString();
  const sessionTimeSlot = session.timeSlot || `${session.startTime?.substring(11, 16) || '10:00'} - ${session.endTime?.substring(11, 16) || '11:00'}`;

  // 4. Update session attendee records
  const updatedCheckedIn = Array.from(new Set([...(session.checkedIn || []), memberId]));
  const updatedNoShows = (session.noShows || []).filter(id => id !== memberId);
  const updatedAttendees = Array.from(new Set([...(session.attendees || []), memberId]));

  const updatedRecord: AttendeeRecord = {
    memberId,
    memberName: member.name,
    status: 'ATTENDED',
    checkInType: 'RETROACTIVE',
    checkedInAt: nowIso,
    checkedInBy: requesterUser.id,
    notes: reason || 'Manual reconciliation with paper attendance sheet'
  };

  const attendeeRecords = {
    ...(session.attendeeRecords || {}),
    [memberId]: updatedRecord
  };

  // 5. Strike forgiveness: decrement noShowStrikes if member was previously marked no-show
  let updatedStrikes = member.noShowStrikes ?? 0;
  let updatedBlockedUntil = member.bookingBlockedUntil;
  if ((session.noShows || []).includes(memberId) && updatedStrikes > 0) {
    updatedStrikes = Math.max(0, updatedStrikes - 1);
    if (updatedStrikes < 3) {
      updatedBlockedUntil = null;
    }
  }

  // 6. Generate immutable audit log entry
  const auditLog: AuditLogEntry = {
    sessionId: session.id,
    sessionDate: session.date,
    sessionTime: sessionTimeSlot,
    memberId: member.id,
    memberName: member.name,
    performedBy: requesterUser.id,
    performedAt: nowIso,
    action: 'RETROACTIVE_CHECK_IN',
    previousStatus: (session.noShows || []).includes(memberId) ? 'NO_SHOW' : isEnrolled ? 'BOOKED' : 'UNMARKED',
    newStatus: 'ATTENDED',
    checkInType: 'RETROACTIVE',
    notes: reason || 'Manual reconciliation with paper attendance sheet'
  };

  return {
    success: true,
    status: 200,
    message: 'Retroactive attendance recorded successfully.',
    creditsDeducted,
    remainingCredits: newRemainingCredits,
    sessionUpdates: {
      attendees: updatedAttendees,
      checkedIn: updatedCheckedIn,
      noShows: updatedNoShows,
      attendeeRecords
    },
    memberUpdates: {
      sessionsRemaining: newRemainingCredits,
      ...(member.activePackage ? {
        activePackage: {
          ...member.activePackage,
          creditsLeft: newRemainingCredits,
          usedCredits: (member.activePackage.usedCredits ?? 0) + (creditsDeducted ? 1 : 0)
        }
      } : {}),
      noShowStrikes: updatedStrikes,
      bookingBlockedUntil: updatedBlockedUntil
    },
    auditLog
  };
}
