export interface AttendanceRecord {
  id: string;
  memberId: string;
  packageId?: string;
  sessionId?: string;
  sessionTitle: string;        // e.g., "Kids Boxing"
  branchId?: string;           // e.g., "strike_maxim"
  branchName: string;          // e.g., "Maxim Compound"
  sessionDate: string;         // e.g., "2026-09-20"
  sessionTime?: string;        // e.g., "17:00 - 18:00"
  checkedInAt: string;         // ISO timestamp of check-in
  checkedInBy?: string;        // Staff ID, Staff name, or "SELF_CHECKIN_APP"
  status: 'ATTENDED' | 'NO_SHOW' | 'CANCELLED';
  remainingCreditsAfter: number;
  notes?: string;
  createdAt?: string;
}
