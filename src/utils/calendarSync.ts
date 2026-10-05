/**
 * MitrixoGYM & Inzan Athletics Calendar Sync Utilities
 * RFC 5545 compliant iCalendar (.ics) generation & Google Calendar integration
 */

export interface CalendarEvent {
  title: string;
  description: string;
  location: string;
  startTime: string;
  endTime: string;
}

/**
 * Converts a date string or Date object into UTC RFC 5545 format: YYYYMMDDTHHmmssZ
 */
function formatDateToUtc(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) {
    return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * Escapes characters for standard iCalendar RFC 5545 text fields
 */
function escapeIcsText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Generates a direct web link to Google Calendar template with URL-encoded parameters.
 */
export function getGoogleCalendarUrl(event: {
  title: string;
  description: string;
  location: string;
  startTime: string;
  endTime: string;
}): string {
  const startDate = new Date(event.startTime);
  const validStart = !isNaN(startDate.getTime()) ? startDate : new Date();

  let endDate = new Date(event.endTime);
  if (isNaN(endDate.getTime()) || endDate <= validStart) {
    endDate = new Date(validStart.getTime() + 60 * 60 * 1000); // 1-hour duration default
  }

  const startFormatted = formatDateToUtc(validStart);
  const endFormatted = formatDateToUtc(endDate);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title || 'Workout Session',
    details: event.description || '',
    location: event.location || 'Inzan Athletics',
    dates: `${startFormatted}/${endFormatted}`
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Builds a single VEVENT block (including its BEGIN/END markers).
 * `uidSuffix` keeps UIDs unique when several events share one calendar file.
 */
function buildEventLines(event: CalendarEvent, uidSuffix: string): string[] {
  const startFormatted = formatDateToUtc(event.startTime);
  const endFormatted = formatDateToUtc(event.endTime);
  const dtstamp = formatDateToUtc(new Date());
  const uid = `${Date.now()}-${uidSuffix}@inzanathletics.mitrixogym.com`;

  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${startFormatted}`,
    `DTEND:${endFormatted}`,
    `SUMMARY:${escapeIcsText(event.title || 'Workout Session')}`,
    `DESCRIPTION:${escapeIcsText(event.description || '')}`,
    `LOCATION:${escapeIcsText(event.location || 'Inzan Athletics')}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
  ];
}

/**
 * Builds a complete RFC 5545 VCALENDAR document for one or more events.
 * Returns an empty string when no event has a usable start time, so callers
 * never hand the user a file full of events collapsed onto "now".
 */
export function generateICSCalendar(events: CalendarEvent[]): string {
  const usable = (events || []).filter(e => e && !isNaN(new Date(e.startTime).getTime()));
  if (usable.length === 0) return '';

  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Inzan Athletics//MitrixoGYM Calendar Sync//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    // DTSTART/DTEND are always emitted as UTC instants (trailing Z), so the
    // displayed local time is correct in any client regardless of device zone.
    // These two headers tell clients which zone the club operates in.
    'X-WR-TIMEZONE:Africa/Cairo',
    'X-WR-CALDESC:Inzan Athletics bookings',
  ];
  const body = usable.flatMap((e, i) => buildEventLines(e, `${i}-${Math.random().toString(36).substring(2, 9)}`));
  const footer = ['END:VCALENDAR'];

  return [...header, ...body, ...footer].join('\r\n');
}

/**
 * Single-event convenience wrapper around generateICSCalendar.
 */
export function generateICSEvent(event: CalendarEvent): string {
  return generateICSCalendar([event]);
}

/**
 * Triggers a browser download of the given iCalendar content.
 */
export function downloadICS(filename: string, icsContent: string): void {
  if (!icsContent) return;
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  const safeName = (filename || 'calendar').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  link.setAttribute('download', `${safeName}.ics`);

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates standard RFC 5545 .ics iCalendar text, creates a Blob, and triggers browser file download.
 */
export function generateIcsFile(event: {
  title: string;
  description: string;
  location: string;
  startTime: string;
  endTime: string;
}): void {
  const startDate = new Date(event.startTime);
  const validStart = !isNaN(startDate.getTime()) ? startDate : new Date();

  let endDate = new Date(event.endTime);
  if (isNaN(endDate.getTime()) || endDate <= validStart) {
    endDate = new Date(validStart.getTime() + 60 * 60 * 1000);
  }

  downloadICS(event.title || 'event', generateICSCalendar([{
    title: event.title,
    description: event.description,
    location: event.location,
    startTime: validStart.toISOString(),
    endTime: endDate.toISOString(),
  }]));
}
