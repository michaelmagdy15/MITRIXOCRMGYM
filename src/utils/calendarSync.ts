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

  const startFormatted = formatDateToUtc(validStart);
  const endFormatted = formatDateToUtc(endDate);
  const dtstamp = formatDateToUtc(new Date());
  const uid = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}@inzanathletics.mitrixogym.com`;

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Inzan Athletics//MitrixoGYM Calendar Sync//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
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
    'END:VCALENDAR'
  ];

  const icsContent = icsLines.join('\r\n');
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  const sanitizedTitle = (event.title || 'event')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .toLowerCase()
    .slice(0, 40);
  link.setAttribute('download', `${sanitizedTitle}.ics`);

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
