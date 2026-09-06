import { toValidDate } from './utils/dateUtils';

export function cleanData(data: any): any {
  if (data === null || data === undefined) return undefined;
  if (Array.isArray(data)) return data.map(cleanData).filter((v: any) => v !== undefined);
  if (typeof data === 'object' && !(data instanceof Date)) {
    const clean: any = {};
    Object.keys(data).forEach(key => {
      const val = cleanData(data[key]);
      if (val !== undefined) {
        clean[key] = val;
      }
    });
    return clean;
  }
  return data;
}

/**
 * Convert UTC ISO string to Egypt local time for display
 * @param dateString ISO date string in UTC (e.g., "2026-05-03T20:00:00Z")
 * @returns Formatted string in Egypt timezone (Cairo time)
 */
export function toEgyptTime(dateString: any): string {
  const date = toValidDate(dateString);
  if (!date) return '—';
  try {
    return date.toLocaleString('en-EG', { timeZone: 'Africa/Cairo' });
  } catch {
    return '—';
  }
}

/**
 * Parse and format time in Egypt timezone
 * @param dateString ISO date string, Date, or timestamp
 * @returns Date object for use with date-fns formatters in Egypt time
 */
export function getEgyptDate(dateString?: any): Date {
  const date = toValidDate(dateString) || new Date();
  try {
    const formatter = new Intl.DateTimeFormat('en-EG', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value || '2026';
    const month = parts.find(p => p.type === 'month')?.value || '01';
    const day = parts.find(p => p.type === 'day')?.value || '01';
    const hour = parts.find(p => p.type === 'hour')?.value || '00';
    const minute = parts.find(p => p.type === 'minute')?.value || '00';
    const second = parts.find(p => p.type === 'second')?.value || '00';

    const result = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
    return isNaN(result.getTime()) ? date : result;
  } catch {
    return date;
  }
}
