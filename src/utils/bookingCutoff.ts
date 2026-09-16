export interface BookingWindowConfig {
  defaultCutoffMinutes: number; // e.g., 90 or 120 minutes
  allowWalkInsViaAdminOnly: boolean; // true
}

export const DEFAULT_BOOKING_WINDOW_CONFIG: BookingWindowConfig = {
  defaultCutoffMinutes: 120, // 2 hours default
  allowWalkInsViaAdminOnly: true,
};

export class AppError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number = 400, code: string = 'APP_ERROR') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Extracts session start timestamp from diverse possible formats:
 * - session.startTime (ISO string)
 * - session.date + session.time
 * - session.date + session.startTime
 */
export function getSessionStartTime(session: any): Date | null {
  if (!session) return null;

  if (session.startTime) {
    const d = new Date(session.startTime);
    if (!isNaN(d.getTime())) return d;
  }

  const dateStr = session.date || (typeof session.startTime === 'string' ? session.startTime.substring(0, 10) : null);
  const timeStr = session.time || (typeof session.startTime === 'string' ? session.startTime.substring(11, 16) : null);

  if (dateStr && timeStr) {
    const formattedTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
    const combined = new Date(`${dateStr}T${formattedTime}`);
    if (!isNaN(combined.getTime())) return combined;
  }

  return null;
}

/**
 * Resolves cutoff minutes with hierarchical fallbacks:
 * 1. session.cutoffMinutes (per-class override)
 * 2. config.defaultCutoffMinutes (branch or tenant level setting)
 * 3. 120 minutes (default 2 hours)
 */
export function getBookingCutoffMinutes(
  session?: any,
  config?: Partial<BookingWindowConfig> | number | null
): number {
  if (typeof session === 'number' && !isNaN(session)) {
    return session;
  }

  if (session && typeof session === 'object' && session.cutoffMinutes !== undefined && session.cutoffMinutes !== null && !isNaN(Number(session.cutoffMinutes))) {
    return Number(session.cutoffMinutes);
  }

  if (typeof config === 'number' && !isNaN(config)) {
    return config;
  }

  if (config && typeof config === 'object' && config.defaultCutoffMinutes !== undefined && config.defaultCutoffMinutes !== null && !isNaN(Number(config.defaultCutoffMinutes))) {
    return Number(config.defaultCutoffMinutes);
  }

  return DEFAULT_BOOKING_WINDOW_CONFIG.defaultCutoffMinutes;
}

/**
 * Calculates cutoff deadline (sessionStartTime - cutoffMinutes)
 */
export function getBookingCutoffDeadline(sessionStartTime: Date, cutoffMinutes: number = 120): Date {
  return new Date(sessionStartTime.getTime() - cutoffMinutes * 60 * 1000);
}

/**
 * Checks if the current time has passed the booking cutoff deadline for a session
 */
export function isBookingCutoffExceeded(
  session: any,
  cutoffMinutes?: number,
  now: Date = new Date()
): boolean {
  const sessionStartTime = getSessionStartTime(session);
  if (!sessionStartTime) return false;

  const resolvedMinutes = cutoffMinutes !== undefined && !isNaN(cutoffMinutes)
    ? cutoffMinutes
    : getBookingCutoffMinutes(session);

  const cutoffDeadline = getBookingCutoffDeadline(sessionStartTime, resolvedMinutes);
  return now.getTime() >= cutoffDeadline.getTime();
}

/**
 * Returns user-friendly text describing the cutoff window, e.g. "2h" or "90m"
 */
export function formatCutoffBadgeText(cutoffMinutes: number = 120): string {
  if (cutoffMinutes >= 60 && cutoffMinutes % 60 === 0) {
    return `${cutoffMinutes / 60}h`;
  }
  if (cutoffMinutes > 60) {
    const hours = Math.floor(cutoffMinutes / 60);
    const mins = cutoffMinutes % 60;
    return `${hours}h ${mins}m`;
  }
  return `${cutoffMinutes}m`;
}
