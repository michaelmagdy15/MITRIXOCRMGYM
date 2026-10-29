import { format as fnsFormat, parseISO, isValid, addDays, isSameDay, formatDistanceToNow } from 'date-fns';

export const GYM_DEFAULT_TIMEZONE = 'Africa/Cairo';

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
 * Safely parses an expiry date value to the end of that day (23:59:59.999).
 * If the input is a date-only string (e.g. YYYY-MM-DD), it sets the time to 23:59:59.999
 * so members are not blocked or expired mid-day on their last valid date.
 */
export function safeParseExpiryToEndOfDay(val: any): Date | null {
  const d = toValidDate(val);
  if (!d) return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const eod = new Date(d);
      eod.setHours(23, 59, 59, 999);
      return eod;
    }
  }
  return d;
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

/**
 * Returns today's or any date's calendar string formatted as 'YYYY-MM-DD'
 * in the gym's local timezone (defaults to Africa/Cairo).
 * Guarantees that at 11:30 PM or 12:30 AM in Cairo, the date returned matches Cairo local time,
 * even when UTC is on yesterday or tomorrow.
 */
export function getGymDateString(dateInput?: any, timeZone: string = GYM_DEFAULT_TIMEZONE): string {
  const d = dateInput ? toValidDate(dateInput) : new Date();
  if (!d) return '';
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone });
    return formatter.format(d);
  } catch {
    return (d || new Date()).toISOString().substring(0, 10);
  }
}

/**
 * Returns the local time string formatted as 'HH:mm' in the gym's local timezone.
 */
export function getGymTimeString(dateInput?: any, timeZone: string = GYM_DEFAULT_TIMEZONE): string {
  const d = dateInput ? toValidDate(dateInput) : new Date();
  if (!d) return '';
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return formatter.format(d);
  } catch {
    return '00:00';
  }
}

/**
 * Extracts gym local date and time parts:
 * { year, month, day, hours, minutes, seconds, dateStr, timeStr }
 */
export function getGymDateTimeParts(dateInput?: any, timeZone: string = GYM_DEFAULT_TIMEZONE): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  dateStr: string;
  timeStr: string;
} {
  const d = dateInput ? toValidDate(dateInput) : new Date();
  const fallback = d || new Date();
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23'
    });
    const parts = formatter.formatToParts(fallback);
    const p: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        p[part.type] = parseInt(part.value, 10);
      }
    }
    const year = p.year || fallback.getUTCFullYear();
    const month = p.month || fallback.getUTCMonth() + 1;
    const day = p.day || fallback.getUTCDate();
    const hours = p.hour !== undefined ? p.hour : fallback.getUTCHours();
    const minutes = p.minute !== undefined ? p.minute : fallback.getUTCMinutes();
    const seconds = p.second !== undefined ? p.second : fallback.getUTCSeconds();

    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    return { year, month, day, hours, minutes, seconds, dateStr, timeStr };
  } catch {
    const year = fallback.getUTCFullYear();
    const month = fallback.getUTCMonth() + 1;
    const day = fallback.getUTCDate();
    const hours = fallback.getUTCHours();
    const minutes = fallback.getUTCMinutes();
    const seconds = fallback.getUTCSeconds();
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    return { year, month, day, hours, minutes, seconds, dateStr, timeStr };
  }
}

/**
 * Converts a gym local date string (YYYY-MM-DD) and local time string (HH:mm)
 * to an accurate UTC ISO timestamp string (with trailing 'Z'), correctly accounting
 * for whatever UTC offset (e.g. UTC+3 summer or UTC+2 winter) applies on that specific day and time.
 */
export function getGymLocalToUtcIso(dateStr?: string, timeStr?: string, timeZone: string = GYM_DEFAULT_TIMEZONE): string {
  const safeDate = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())
    ? dateStr.trim()
    : getGymDateString(new Date(), timeZone);

  let hours = 12;
  let minutes = 0;
  if (timeStr) {
    const trimmed = String(timeStr).trim();
    const match = trimmed.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (match) {
      hours = parseInt(match[1] || '12', 10);
      minutes = parseInt(match[2] || '0', 10);
      const meridiem = match[4]?.toUpperCase();
      if (meridiem === 'PM' && hours < 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;
    }
  }

  const dateParts = safeDate.split('-').map(Number);
  const y = dateParts[0] ?? 2026;
  const m = dateParts[1] ?? 1;
  const d = dateParts[2] ?? 1;
  const approx = new Date(Date.UTC(y, m - 1, d, hours, minutes, 0));

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23'
    });
    const parts = formatter.formatToParts(approx);
    const p: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
    }
    const asYear = p.year ?? y;
    const asMonth = p.month ?? m;
    const asDay = p.day ?? d;
    const asHour = p.hour ?? hours;
    const asMinute = p.minute ?? minutes;
    const asSecond = p.second ?? 0;
    const asLocal = Date.UTC(asYear, asMonth - 1, asDay, asHour, asMinute, asSecond);
    const offsetMs = asLocal - approx.getTime();
    return new Date(approx.getTime() - offsetMs).toISOString();
  } catch {
    return approx.toISOString();
  }
}

/**
 * Computes exact UTC ISO boundary for start-of-day (00:00:00.000) or end-of-day (23:59:59.999)
 * for a gym local date string (YYYY-MM-DD), dynamically deriving the offset on that date.
 */
export function getGymDayBoundaryUtc(dateStr: string, endOfDay: boolean, timeZone: string = GYM_DEFAULT_TIMEZONE): string {
  const cleanDate = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())
    ? dateStr.trim()
    : getGymDateString(new Date(), timeZone);

  const dateParts = cleanDate.split('-').map(Number);
  const y = dateParts[0] ?? 2026;
  const m = dateParts[1] ?? 1;
  const d = dateParts[2] ?? 1;
  const [hh, mm, ss, ms] = endOfDay ? [23, 59, 59, 999] : [0, 0, 0, 0];
  const approx = new Date(Date.UTC(y, m - 1, d, hh, mm, ss, ms));

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23'
    });
    const parts = formatter.formatToParts(approx);
    const p: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
    }
    const asYear = p.year ?? y;
    const asMonth = p.month ?? m;
    const asDay = p.day ?? d;
    const asHour = p.hour ?? hh;
    const asMinute = p.minute ?? mm;
    const asSecond = p.second ?? ss;
    const asLocal = Date.UTC(asYear, asMonth - 1, asDay, asHour, asMinute, asSecond, ms);
    const offsetMs = asLocal - approx.getTime();
    const exact = new Date(approx.getTime() - offsetMs);
    return exact.toISOString();
  } catch {
    return approx.toISOString();
  }
}

/**
 * Safely constructs a valid ISO datetime string from a date string (YYYY-MM-DD)
 * and an arbitrary time string (e.g. "8:00 PM", "20:00", "8:00 PM - 9:00 PM", "10:30 AM").
 * Uses the gym's local timezone (Africa/Cairo) to calculate the exact UTC instant.
 * Never produces NaN or invalid ISO datetime.
 */
export function toSafeIsoDateTime(dateStr?: string, timeStr?: string, timeZone: string = GYM_DEFAULT_TIMEZONE): string {
  return getGymLocalToUtcIso(dateStr, timeStr, timeZone);
}
