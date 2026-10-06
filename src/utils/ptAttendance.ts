/**
 * PT Session Attendance and Token Balance Rules
 * Conforming to Inzan Athletics PRD Sections 6, 12, 17, 21.
 */

export interface PTPackageSnapshot {
  id?: string;
  packageId?: string;
  name?: string;
  packageName?: string;
  type?: string;
  isPT?: boolean;
  sessionsTotal?: number | 'unlimited';
  sessionsRemaining?: number;
  usedSessions?: number;
  status?: string;
  endDate?: string;
}

export interface ClientPTSnapshot {
  id: string;
  name: string;
  sessionsRemaining?: number | 'unlimited';
  usedSessions?: number;
  packages?: PTPackageSnapshot[];
  strikes?: number;
  noShowStrikes?: number;
}

export interface PTSessionSnapshot {
  id: string;
  clientId: string;
  date: string;
  time?: string;
  startTime?: string;
  status: 'Scheduled' | 'Attended' | 'No Show' | 'Cancelled' | 'Rescheduled';
}

export interface SessionDeductionResult {
  clientUpdates: Partial<ClientPTSnapshot>;
  actionTaken: 'deducted' | 'restored' | 'unchanged' | 'forfeited_late_cancel';
  action: 'deducted' | 'restored' | 'unchanged' | 'forfeited_late_cancel';
  reason: string;
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export function parseSessionStartMs(dateStr: string, timeStr?: string, startTimeIso?: string): number {
  if (startTimeIso) {
    const parsed = new Date(startTimeIso).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  if (dateStr) {
    const parsed = new Date(`${dateStr}T${timeStr || '10:00'}:00`).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  return NaN;
}

/**
 * Calculates updated package and client balances when a PT session changes status.
 */
export function calculatePTBalanceTransition(
  session: PTSessionSnapshot,
  newStatus: 'Scheduled' | 'Attended' | 'No Show' | 'Cancelled' | 'Rescheduled',
  client: ClientPTSnapshot,
  now: Date = new Date()
): SessionDeductionResult {
  const oldStatus = session.status;
  const isCurrentlyDeducted = oldStatus === 'Attended' || oldStatus === 'No Show';

  // Session start time calculation
  const sessionStartMs = parseSessionStartMs(session.date, session.time, session.startTime);
  const isLateCancellation = !isNaN(sessionStartMs) && (sessionStartMs - now.getTime() < TWELVE_HOURS_MS);

  let targetShouldBeDeducted = false;
  let action: 'deducted' | 'restored' | 'unchanged' | 'forfeited_late_cancel' = 'unchanged';
  let reason = '';

  if (newStatus === 'Attended') {
    targetShouldBeDeducted = true;
    action = isCurrentlyDeducted ? 'unchanged' : 'deducted';
    reason = 'Attended private personal training session.';
  } else if (newStatus === 'No Show') {
    targetShouldBeDeducted = true;
    action = isCurrentlyDeducted ? 'unchanged' : 'deducted';
    reason = 'Member was no-show; session token deducted per gym policy.';
  } else if (newStatus === 'Cancelled') {
    if (isLateCancellation) {
      targetShouldBeDeducted = true;
      action = isCurrentlyDeducted ? 'unchanged' : 'forfeited_late_cancel';
      reason = 'Late cancellation (<12h notice); session token forfeited per gym policy.';
    } else {
      targetShouldBeDeducted = false;
      action = isCurrentlyDeducted ? 'restored' : 'unchanged';
      reason = 'Session cancelled in advance (>12h notice); token preserved/restored.';
    }
  } else if (newStatus === 'Scheduled' || newStatus === 'Rescheduled') {
    targetShouldBeDeducted = false;
    action = isCurrentlyDeducted ? 'restored' : 'unchanged';
    reason = newStatus === 'Rescheduled' ? 'Session rescheduled; token preserved.' : 'Session reset to scheduled; token restored.';
  }

  // If no delta in deduction status, return unchanged
  if (isCurrentlyDeducted === targetShouldBeDeducted) {
    return {
      clientUpdates: {},
      actionTaken: 'unchanged',
      action: 'unchanged',
      reason: `No token balance adjustment needed (${oldStatus} -> ${newStatus}).`
    };
  }

  // Clone packages
  const packages: PTPackageSnapshot[] = Array.isArray(client.packages)
    ? client.packages.map((p) => ({ ...p }))
    : [];

  const delta = targetShouldBeDeducted ? -1 : 1; // -1 means deduct 1 session, +1 means restore 1 session

  // Find target PT package
  let matchedPackageIndex = -1;
  for (let i = 0; i < packages.length; i++) {
    const pkg = packages[i]!;
    const isPt =
      pkg.isPT === true ||
      pkg.type === 'pt' ||
      (pkg.name || '').toLowerCase().includes('pt') ||
      (pkg.packageName || '').toLowerCase().includes('pt');

    if (isPt && pkg.sessionsTotal !== 'unlimited') {
      matchedPackageIndex = i;
      break;
    }
  }

  if (matchedPackageIndex >= 0) {
    const pkg = packages[matchedPackageIndex]!;
    const curRem = pkg.sessionsRemaining ?? 0;
    const curUsed = pkg.usedSessions ?? 0;

    if (delta < 0) {
      pkg.sessionsRemaining = Math.max(0, curRem - 1);
      pkg.usedSessions = curUsed + 1;
    } else {
      pkg.sessionsRemaining = curRem + 1;
      pkg.usedSessions = Math.max(0, curUsed - 1);
    }
  }

  // Update client root balance
  let updatedRemaining = client.sessionsRemaining;
  let updatedUsed = client.usedSessions ?? 0;

  if (typeof client.sessionsRemaining === 'number') {
    if (delta < 0) {
      updatedRemaining = Math.max(0, client.sessionsRemaining - 1);
      updatedUsed = updatedUsed + 1;
    } else {
      updatedRemaining = client.sessionsRemaining + 1;
      updatedUsed = Math.max(0, updatedUsed - 1);
    }
  } else if (client.sessionsRemaining === 'unlimited') {
    if (delta < 0) {
      updatedUsed = updatedUsed + 1;
    } else {
      updatedUsed = Math.max(0, updatedUsed - 1);
    }
  }

  return {
    clientUpdates: {
      packages,
      sessionsRemaining: updatedRemaining,
      usedSessions: updatedUsed
    },
    actionTaken: action,
    action,
    reason
  };
}
