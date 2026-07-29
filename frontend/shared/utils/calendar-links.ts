// ---------------------------------------------------------------------------
// Calendar-link helpers.
//
// Builds "Add to Calendar" URLs that pre-fill an event when the user clicks
// through. Currently only Google Calendar's template URL is implemented —
// extend the file when Outlook / Yahoo / .ics are needed (keep the same
// `CalendarEvent` shape so callers don't have to change).
//
// Example:
//   <a href={buildGoogleCalendarUrl({
//     title:   'Video Verification Call',
//     details: 'Have your Aadhaar and PAN ready.',
//     startAt: '2026-06-03T14:00:00+05:30',
//     // either endAt or durationMinutes
//     durationMinutes: 30,
//     location: 'Google Meet link will be emailed',
//     attendees: ['candidate@example.com'],
//   })}>Add to Google Calendar</a>
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  /** Event title. Shown as the calendar item's name. */
  title: string;
  /** Optional long description (URLs are preserved as plain text). */
  details?: string;
  /** Optional venue / meeting-link string. */
  location?: string;
  /** Start time. ISO 8601 string or Date. */
  startAt: string | Date;
  /**
   * End time. ISO 8601 string or Date. Pass either `endAt` OR
   * `durationMinutes`; if both are supplied, `endAt` wins.
   */
  endAt?: string | Date;
  /**
   * Convenience: derive `endAt` as `startAt + durationMinutes`. Ignored
   * when `endAt` is also provided.
   */
  durationMinutes?: number;
  /**
   * Optional attendee email list. Google Calendar's `add` param is
   * legacy/undocumented but still pre-fills the guest list; no error
   * when omitted.
   */
  attendees?: string[];
  /**
   * Optional IANA timezone (e.g. 'Asia/Kolkata'). Google interprets
   * `dates` in UTC by default; setting `ctz` displays the event in the
   * specified zone in the user's Calendar UI.
   */
  timezone?: string;
}

/**
 * Format a Date as the compact UTC stamp Google Calendar expects
 * (`YYYYMMDDTHHMMSSZ` — no separators, trailing Z).
 */
function toGoogleCalendarStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function resolveEnd(event: CalendarEvent, start: Date): Date {
  if (event.endAt) {
    const end = event.endAt instanceof Date ? event.endAt : new Date(event.endAt);
    if (!Number.isNaN(end.getTime())) return end;
  }
  if (typeof event.durationMinutes === 'number' && event.durationMinutes > 0) {
    return new Date(start.getTime() + event.durationMinutes * 60_000);
  }
  // Sensible default — a 30-min event matches the Video-KYC slot size
  // and is the most common short-meeting length.
  return new Date(start.getTime() + 30 * 60_000);
}

/**
 * Build a Google Calendar "create event" link. Opens in a new tab,
 * pre-fills the form. The user still needs to click Save in Google to
 * persist — useful when you don't want to ask for OAuth scopes.
 *
 * Throws if `startAt` is not a valid date.
 */
export function buildGoogleCalendarUrl(event: CalendarEvent): string {
  const start =
    event.startAt instanceof Date ? event.startAt : new Date(event.startAt);
  if (Number.isNaN(start.getTime())) {
    throw new Error('buildGoogleCalendarUrl: invalid startAt');
  }
  const end = resolveEnd(event, start);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toGoogleCalendarStamp(start)}/${toGoogleCalendarStamp(end)}`,
  });
  if (event.details) params.set('details', event.details);
  if (event.location) params.set('location', event.location);
  if (event.timezone) params.set('ctz', event.timezone);
  if (event.attendees && event.attendees.length > 0) {
    params.set('add', event.attendees.join(','));
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
