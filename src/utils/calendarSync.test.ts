import assert from 'assert';
import { generateICSEvent, generateICSCalendar, getGoogleCalendarUrl, CalendarEvent } from './calendarSync';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

const baseEvent: CalendarEvent = {
  title: 'PT Session',
  description: 'Focus: Speed work',
  location: 'Maxim Compound',
  startTime: '2026-03-02T10:00:00Z',
  endTime: '2026-03-02T11:00:00Z',
};

function runCalendarSyncTests() {
  console.log('Running calendar sync tests...');

  test('Single event produces a valid VCALENDAR envelope', () => {
    const ics = generateICSCalendar([baseEvent]);
    assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
    assert.ok(ics.endsWith('END:VCALENDAR'));
    assert.ok(ics.includes('VERSION:2.0'));
    assert.ok(ics.includes('METHOD:PUBLISH'));
  });

  test('Event times are emitted as RFC 5545 UTC stamps', () => {
    const ics = generateICSCalendar([baseEvent]);
    assert.ok(ics.includes('DTSTART:20260302T100000Z'));
    assert.ok(ics.includes('DTEND:20260302T110000Z'));
    assert.ok(/DTSTAMP:\d{8}T\d{6}Z/.test(ics));
  });

  test('Reserved characters are escaped per RFC 5545', () => {
    const ics = generateICSCalendar([{
      ...baseEvent,
      title: 'Boxing; Basics, Level 1',
      description: 'Line one\nLine two, with comma',
    }]);
    assert.ok(ics.includes('SUMMARY:Boxing\\; Basics\\, Level 1'));
    assert.ok(ics.includes('DESCRIPTION:Line one\\nLine two\\, with comma'));
  });

  test('Multi-event export emits one VEVENT per booking with unique UIDs', () => {
    const ics = generateICSCalendar([
      baseEvent,
      { ...baseEvent, title: 'Boxing', startTime: '2026-03-03T18:00:00Z', endTime: '2026-03-03T19:00:00Z' },
    ]);
    const events = ics.match(/BEGIN:VEVENT/g) || [];
    assert.strictEqual(events.length, 2);
    const uids = ics.match(/UID:[^\r\n]+/g) || [];
    assert.strictEqual(uids.length, 2);
    assert.notStrictEqual(uids[0], uids[1]);
    assert.ok(ics.includes('DTSTART:20260303T180000Z'));
  });

  test('Events without a usable start time are dropped, not collapsed to now', () => {
    const ics = generateICSCalendar([
      baseEvent,
      { ...baseEvent, title: 'Broken', startTime: 'not-a-date' },
    ]);
    assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
    assert.ok(!ics.includes('Broken'));
  });

  test('Empty or fully invalid input yields empty string (no bogus file)', () => {
    assert.strictEqual(generateICSCalendar([]), '');
    assert.strictEqual(generateICSCalendar([{ ...baseEvent, startTime: 'nope' }]), '');
  });

  test('Missing title, description, location fall back to safe defaults', () => {
    const ics = generateICSCalendar([{
      title: '', description: '', location: '',
      startTime: '2026-03-02T10:00:00Z', endTime: '2026-03-02T11:00:00Z',
    }]);
    assert.ok(ics.includes('SUMMARY:Workout Session'));
    assert.ok(ics.includes('LOCATION:Inzan Athletics'));
  });

  test('Google Calendar URL carries action, dates, and encoded fields', () => {
    const url = getGoogleCalendarUrl(baseEvent);
    assert.ok(url.startsWith('https://calendar.google.com/calendar/render?'));
    assert.ok(url.includes('action=TEMPLATE'));
    assert.ok(url.includes('20260302T100000Z%2F20260302T110000Z'));
    assert.ok(url.includes('text=PT+Session'));
    assert.ok(url.includes('location=Maxim+Compound'));
  });

  test('Google Calendar URL falls back to a 1-hour window for bad end times', () => {
    const url = getGoogleCalendarUrl({ ...baseEvent, endTime: 'garbage' });
    const dates = /dates=([^&]+)/.exec(url)?.[1];
    assert.ok(dates, 'dates param missing');
    assert.ok(/^20260302T100000Z%2F\d{8}T\d{6}Z$/.test(dates!), `unexpected dates=${dates}`);
  });

  test('Calendar header declares the Africa/Cairo club timezone', () => {
    const ics = generateICSCalendar([baseEvent]);
    assert.ok(ics.includes('X-WR-TIMEZONE:Africa/Cairo'));
  });

  test('generateICSEvent wraps a single event', () => {
    const ics = generateICSEvent(baseEvent);
    assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
    assert.ok(ics.includes('SUMMARY:PT Session'));
  });

  test('CRLF line endings are used for ICS content', () => {
    const ics = generateICSCalendar([baseEvent]);
    assert.ok(ics.includes('\r\n'));
    assert.ok(!/[^\r]\n/.test(ics));
  });

  console.log('All calendar sync tests passed.');
}

runCalendarSyncTests();
