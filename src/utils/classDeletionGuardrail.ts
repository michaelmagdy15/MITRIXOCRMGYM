import { ClassSchedule } from '../types/class';

export interface ClassDeletionCheckResult {
  allowed: boolean;
  activeBookingsCount: number;
  waitlistCount: number;
  totalBlockingCount: number;
  reason?: string;
}

export function canDeleteClassSession(cls?: Partial<ClassSchedule> | null): ClassDeletionCheckResult {
  const activeBookingsCount = Array.isArray(cls?.attendees) ? cls!.attendees.length : 0;
  const waitlistCount = Array.isArray(cls?.waitlist) ? cls!.waitlist.length : 0;
  const totalBlockingCount = activeBookingsCount + waitlistCount;

  if (totalBlockingCount > 0) {
    return {
      allowed: false,
      activeBookingsCount,
      waitlistCount,
      totalBlockingCount,
      reason: `Cannot delete this class session while ${activeBookingsCount} attending member(s)${waitlistCount > 0 ? ` and ${waitlistCount} waitlisted member(s)` : ''} are still booked. Please remove/clear all member bookings from the roster first.`,
    };
  }

  return {
    allowed: true,
    activeBookingsCount: 0,
    waitlistCount: 0,
    totalBlockingCount: 0,
  };
}
