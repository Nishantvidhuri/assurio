/**
 * Shared date formatting utilities.
 *
 * `formatDateTimeIst` — full IST timestamp ("Mon D, YYYY, H:MM AM/PM IST")
 * `formatDate`        — compact DD.MM.YYYY with optional 24-hour time
 * `formatTimeIst`     — IST clock time only ("9:30 AM" / "9:30AM" compact)
 */

/**
 * Formats an IST clock time as "9:30 AM" (or "9:30AM" when `compact`).
 * Used anywhere we render an appointment / slot start time without the
 * date prefix (Verification Schedule rows, candidate schedule picker,
 * reminder cards, etc).
 *
 * Returns '—' for null/undefined values.
 */
export function formatTimeIst(
  value: string | Date | null | undefined,
  options: { compact?: boolean } = {},
): string {
  if (!value) return '—';
  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(new Date(value))
    // en-IN renders "am"/"pm" lowercase — match the design's
    // uppercase meridiem.
    .replace(/(am|pm)$/i, (m) => m.toUpperCase());
  return options.compact ? formatted.replace(/\s/g, '') : formatted;
}

/**
 * Formats a date string or Date to IST (Asia/Kolkata) in "Mon D, YYYY, H:MM AM/PM IST" format.
 * Returns '—' for null/undefined values.
 */
export function formatDateTimeIst(value: string | Date | null): string {
  if (!value) return '—';
  return (
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(value)) + ' IST'
  );
}

/**
 * Formats a date string into "DD.MM.YYYY" format.
 * Optionally includes time in "HH:MM:SS" (24-hour) format.
 *
 * Examples:
 * formatDate("2026-12-05") → "05.12.2026"
 * formatDate("2026-12-05T22:14:00", true) → "05.12.2026 | 22:14:00"
 *
 * Returns '—' for null/undefined values.
 */
export function formatDate(
  iso: string | null | undefined,
  includeTime: boolean = false,
): string {
  if (!iso) return '—';

  const d = new Date(iso);

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  const datePart = `${day}.${month}.${year}`;

  if (!includeTime) return datePart;

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  const timePart = `${hours}:${minutes}:${seconds}`;

  return `${datePart} | ${timePart}`;
}

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
});
const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: '2-digit',
  year: 'numeric',
});

/**
 * Formats a date/time as "05 Dec 2026 at 9:30 PM" in IST. Same
 * timezone as `formatDateTimeIst` but without the trailing "IST"
 * suffix and with an "at" separator between the date and time —
 * suited for inline prose ("Candidate has booked a slot for X"
 * callouts, scheduled-on labels, etc).
 *
 * Returns '—' for null/undefined values.
 */
export function formatScheduledAtIst(
  value: string | Date | null | undefined,
): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(new Date(value))
    .replace(',', ' at')
    .replace(/(am|pm)$/i, (m) => m.toUpperCase());
}

/**
 * Formats a YYYY-MM key (e.g. "2026-05") as "May 2026". Used as
 * section headers when grouping by month.
 */
export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map((n) => Number(n));
  return MONTH_LABEL_FORMATTER.format(new Date(year, month - 1, 1));
}

/**
 * Formats a YYYY-MM-DD ISO date as "May 04, 2026" — the long form
 * the design uses for past-events lists. Skips timezone conversion
 * because the caller's strings are already calendar-local.
 */
export function formatLongDate(iso: string): string {
  const [year, month, day] = iso.split('-').map((n) => Number(n));
  return LONG_DATE_FORMATTER.format(new Date(year, month - 1, day));
}
