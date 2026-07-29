// ---------------------------------------------------------------------------
// Generic date helpers — short day/month names and a stable local-date key.
// Kept in shared/utils so any feature dealing with date pickers, day pills,
// or local-date bucketing can reuse them without re-importing from the
// scheduling module.
// ---------------------------------------------------------------------------

/** 3-letter day-of-week names indexed by JS getDay() (0=Sun … 6=Sat). */
export const DAY_NAMES_SHORT = [
  'SUN', 'MON', 'TUE', 'WED', 'THR', 'FRI', 'SAT',
] as const;

/** 3-letter month names indexed by JS getMonth() (0=Jan … 11=Dec). */
export const MONTH_NAMES_SHORT = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
] as const;

/**
 * Stable `YYYY-MM-DD` key in the **local** timezone.
 *
 * Why not `date.toISOString().slice(0, 10)`? That formats in UTC, so an
 * evening Date in IST (UTC+05:30) would report the previous calendar
 * day. This helper reads `getFullYear/Month/Date` instead, so the key
 * always matches what the user sees on a wall calendar.
 */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * IST calendar-day key (`YYYY-MM-DD`) for an arbitrary instant.
 * Used to group scheduled appointments by the day a candidate sees on
 * their wall calendar regardless of where the server's clock runs.
 */
export function istDayKey(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  // IST = UTC + 5:30. Add the offset, then read UTC parts.
  const ist = new Date(d.getTime() + (5 * 60 + 30) * 60_000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const day = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Append the English ordinal suffix to a day-of-month (1 → "1st"). */
export function withOrdinalSuffix(n: number): string {
  const tail = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (tail[(v - 20) % 10] ?? tail[v] ?? tail[0]);
}

/**
 * "Monday (29th May, 2026)" — header label used by appointment-list
 * day groupings (Verification Schedule today, future scheduling UIs).
 * Browser locale gives us "Monday, 29 May 2026" by default; we splice
 * in the ordinal suffix and parentheses because no Intl option
 * produces the "29th" form natively.
 */
export function formatDayHeaderLong(
  value: string | Date,
  options: { timeZone?: string } = {},
): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: options.timeZone ?? 'Asia/Kolkata',
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? 0);
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  return `${weekday} (${withOrdinalSuffix(day)} ${month}, ${year})`;
}
