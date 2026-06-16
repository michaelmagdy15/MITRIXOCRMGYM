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
export function toEgyptTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-EG', { timeZone: 'Africa/Cairo' });
}

/**
 * Parse and format time in Egypt timezone
 * @param dateString ISO date string
 * @param format desired format (used with date-fns)
 * @returns Date object for use with date-fns formatters in Egypt time
 */
export function getEgyptDate(dateString: string): Date {
  const date = new Date(dateString);
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

  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
}
