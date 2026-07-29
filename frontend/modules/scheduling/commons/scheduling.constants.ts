import {
  DAY_NAMES_SHORT,
  MONTH_NAMES_SHORT,
  localDateKey,
} from '@/shared/utils/date-keys';

// ---------------------------------------------------------------------------
// Scheduling-wide constants and helpers. Anything that the candidate-side
// scheduling UI (today: VideoKycScheduleDialog) or a future scheduling UI
// (phone call, etc.) might want — keep here so the dialog can stay
// presentational.
// ---------------------------------------------------------------------------

/**
 * Slow `transition-colors` duration used by the date pills + time-slot
 * pills. Long enough that selecting an option reads as the cell SLOWLY
 * filling with the primary colour instead of snapping. Applied as an
 * inline `transitionDuration` so the value flows through tailwind-merge
 * without us having to register a custom utility.
 */
export const COLOR_FILL_TRANSITION_MS = 500;

/**
 * Number of selectable weekday pills shown in the picker. The candidate
 * sees 7 weekdays (today's weekday + the next 6 weekdays).
 */
export const VISIBLE_WEEKDAYS = 7;

/**
 * How far ahead, in calendar days, we have to probe to find
 * VISIBLE_WEEKDAYS weekdays. Worst case: today = Friday → the next
 * weekday is Monday (skip Sat+Sun), so the 7th weekday sits ~11 calendar
 * days out. We round up to 14 for headroom + alignment with the server's
 * SCHEDULING_WINDOW_DAYS. The same value is the GET /availability
 * fetch's `to` offset.
 */
export const WEEKDAY_PROBE_CALENDAR_DAYS = 14;

/** Default appointment length in minutes — matches the server's enum. */
export const DEFAULT_APPOINTMENT_DURATION_MINUTES = 30;

// ─── Call-window phase resolution ──────────────────────────────────────
//
// Shared by the candidate Start-call CTA and the admin Join-call button
// so both sides agree on when a call is actually live.
//
//   T < scheduledAt - PRE_CALL_GRACE_MS              → 'before'
//   T ∈ [scheduledAt - GRACE, scheduledAt + WINDOW]  → 'in-window' (joinable)
//   T > scheduledAt + WINDOW                          → 'expired'

/** How early before the slot the join window opens. */
export const PRE_CALL_GRACE_MS = 5 * 60_000;

/** How long after the slot starts the join window stays open. */
export const CALL_WINDOW_MS = 30 * 60_000;

export type ScheduledWindowPhase = 'before' | 'in-window' | 'expired';

export function resolveSchedulePhase(
  scheduledAtIso: string | null,
  now: number,
): ScheduledWindowPhase | null {
  if (!scheduledAtIso) return null;
  const start = new Date(scheduledAtIso).getTime();
  if (Number.isNaN(start)) return null;
  if (now < start - PRE_CALL_GRACE_MS) return 'before';
  if (now <= start + CALL_WINDOW_MS) return 'in-window';
  return 'expired';
}

/** One concrete weekday pill the candidate can click. */
export interface WeekdayPill {
  /** Stable `YYYY-MM-DD` local-date key — also the React `key` for the pill. */
  key: string;
  /** Start-of-day local Date. Used to scope availability fetches. */
  date: Date;
  /** Short day label, e.g. "WED". */
  dayLabel: string;
  /** Zero-padded day-of-month, e.g. "03". */
  dateLabel: string;
  /** Short month label, e.g. "JUN". */
  monthLabel: string;
}

/**
 * Build the candidate's weekday-pill list from available slots. Derives
 * unique dates from the slot list (which is authoritative — only dates
 * with actual AVAILABLE slots show as bookable). Falls back to Mon-Fri
 * hardcoded if slots list is empty to avoid a blank picker UI before
 * slots load. Returns at most VISIBLE_WEEKDAYS pills; probes up to
 * WEEKDAY_PROBE_CALENDAR_DAYS calendar days from today.
 */
export function buildWeekdayPills(slots?: Array<{ startAt: string }> | null): WeekdayPill[] {
  // Extract unique dates from slots (if provided). Map date key → earliest
  // slot on that date for consistent pill ordering.
  const dateKeysFromSlots = new Map<string, Date>();
  if (slots && slots.length > 0) {
    for (const slot of slots) {
      const date = new Date(slot.startAt);
      const key = localDateKey(date);
      if (!dateKeysFromSlots.has(key)) {
        // Reset to midnight local time so consistent across re-renders.
        const midnightDate = new Date(date);
        midnightDate.setHours(0, 0, 0, 0);
        dateKeysFromSlots.set(key, midnightDate);
      }
    }
  }

  const result: WeekdayPill[] = [];

  // If slots provided: use the actual dates from slots (including weekends
  // if they exist in the data). Otherwise, fall back to Mon-Fri scan.
  if (dateKeysFromSlots.size > 0) {
    // Sort slot dates chronologically and take the first VISIBLE_WEEKDAYS.
    const sortedDates = Array.from(dateKeysFromSlots.values()).sort(
      (a, b) => a.getTime() - b.getTime(),
    );
    for (const date of sortedDates) {
      if (result.length >= VISIBLE_WEEKDAYS) break;
      const weekday = date.getDay();
      result.push({
        key: localDateKey(date),
        date,
        dayLabel: DAY_NAMES_SHORT[weekday] ?? '',
        dateLabel: String(date.getDate()).padStart(2, '0'),
        monthLabel: MONTH_NAMES_SHORT[date.getMonth()] ?? '',
      });
    }
  } else {
    // Fallback: no slots yet (loading or error). Show Mon-Fri starting today.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (
      let offset = 0;
      offset < WEEKDAY_PROBE_CALENDAR_DAYS && result.length < VISIBLE_WEEKDAYS;
      offset += 1
    ) {
      const date = new Date(today);
      date.setDate(today.getDate() + offset);
      const weekday = date.getDay();
      if (weekday === 0 || weekday === 6) continue;
      result.push({
        key: localDateKey(date),
        date,
        dayLabel: DAY_NAMES_SHORT[weekday] ?? '',
        dateLabel: String(date.getDate()).padStart(2, '0'),
        monthLabel: MONTH_NAMES_SHORT[date.getMonth()] ?? '',
      });
    }
  }
  return result;
}

/**
 * Format a slot's start time as `HH:MM AM/PM` in the en-IN locale.
 * `toLocaleTimeString` produces lowercase "am"/"pm" — we upper-case
 * them so the pills read "10:00 AM" as designed.
 */
export function formatSlotLabel(date: Date): string {
  return date
    .toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .replace(/\bam\b/i, 'AM')
    .replace(/\bpm\b/i, 'PM');
}
