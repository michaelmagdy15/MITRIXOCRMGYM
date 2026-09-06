import { format as fnsFormat, parseISO, isValid, addDays, isSameDay, formatDistanceToNow } from 'date-fns';

/**
 * Safely parse any date representation into a valid Date object.
 * Returns null if the value cannot be parsed into a valid Date.
 */
export function toValidDate(val: any): Date | null {
  if (val === null || val === undefined || val === '') return null;

  // Firestore Timestamp with .toDate()
  if (typeof val === 'object' && typeof val.toDate === 'function') {
    try {
      const d = val.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch {
      return null;
    }
  }

  // Firestore Timestamp-like object with seconds
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    const d = new Date(val.seconds * 1000);
    if (!isNaN(d.getTime())) return d;
  }

  // Already a Date object
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }

  // Number (Unix timestamp in ms or seconds)
  if (typeof val === 'number') {
    if (isNaN(val)) return null;
    // Guess if seconds instead of ms (10-digit number)
    const ms = val < 10000000000 ? val * 1000 : val;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  // String handling
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (
      !trimmed ||
      trimmed === '—' ||
      trimmed === '-' ||
      trimmed.toLowerCase() === 'invalid date' ||
      trimmed.toLowerCase() === 'nan' ||
      trimmed === '0000-00-00'
    ) {
      return null;
    }

    // Attempt parseISO first (handles ISO-8601 strings cleanly)
    try {
      const parsed = parseISO(trimmed);
      if (isValid(parsed) && !isNaN(parsed.getTime())) {
        return parsed;
      }
    } catch {}

    // Fallback to new Date(trimmed)
    try {
      const d = new Date(trimmed);
      if (isValid(d) && !isNaN(d.getTime())) {
        return d;
      }
    } catch {}
  }

  return null;
}

/**
 * Formats a date safely without ever throwing "RangeError: Invalid time value".
 * If date is missing or invalid, returns fallback (default '—').
 */
export function safeFormatDate(
  dateInput: any,
  formatStr: string,
  fallback: string = '—'
): string {
  if (!dateInput) return fallback;
  try {
    const d = toValidDate(dateInput);
    if (!d) return fallback;
    return fnsFormat(d, formatStr);
  } catch {
    return fallback;
  }
}

/**
 * Safely format time strings like "10:00", "2026-09-06T10:00:00", or Date objects.
 * Never throws RangeError: Invalid time value.
 */
export function safeFormatTime(
  timeOrDateInput: any,
  formatStr: string = 'HH:mm',
  fallback: string = ''
): string {
  if (!timeOrDateInput) return fallback;

  if (typeof timeOrDateInput === 'string') {
    const trimmed = timeOrDateInput.trim();
    // If it's already in pure HH:mm or HH:mm:ss format
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      return trimmed.substring(0, 5);
    }
  }

  const d = toValidDate(timeOrDateInput);
  if (!d) return fallback;

  try {
    return fnsFormat(d, formatStr);
  } catch {
    return fallback;
  }
}

/**
 * Safely converts any date input to ISO 8601 string.
 * Returns new Date().toISOString() or empty string if invalid.
 */
export function safeIsoDate(val: any, fallbackToNow: boolean = false): string {
  const d = toValidDate(val);
  if (d) return d.toISOString();
  return fallbackToNow ? new Date().toISOString() : '';
}

/**
 * Safely adds days to a date, falling back to new Date() if invalid.
 */
export function safeAddDays(dateInput: any, days: number): Date {
  const base = toValidDate(dateInput) || new Date();
  try {
    const res = addDays(base, Number(days) || 0);
    return isNaN(res.getTime()) ? base : res;
  } catch {
    return base;
  }
}

/**
 * Safely checks if two dates represent the same calendar day without throwing.
 */
export function safeIsSameDay(date1: any, date2: any): boolean {
  const d1 = toValidDate(date1);
  const d2 = toValidDate(date2);
  if (!d1 || !d2) return false;
  try {
    return isSameDay(d1, d2);
  } catch {
    return false;
  }
}

/**
 * Safely calculates age from date of birth. Returns empty string if invalid.
 */
export function safeGetAge(dob: any): string {
  const birthDate = toValidDate(dob);
  if (!birthDate) return '';
  try {
    const difference = Date.now() - birthDate.getTime();
    if (difference < 0) return '';
    const ageDate = new Date(difference);
    const age = Math.abs(ageDate.getUTCFullYear() - 1970);
    return isNaN(age) ? '' : ` (Age ${age})`;
  } catch {
    return '';
  }
}

/**
  * Safely formats distance to now (e.g. "3 days ago") without throwing on invalid/null dates.
  */
export function safeFormatDistanceToNow(
  val: any,
  options?: { addSuffix?: boolean; includeSeconds?: boolean },
  fallback: string = 'Never'
): string {
  const d = toValidDate(val);
  if (!d) return fallback;
  try {
    return formatDistanceToNow(d, options);
  } catch {
    return fallback;
  }
}

