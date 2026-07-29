// Static constants for the Verification Schedule Settings dialog.
// Pulled out of the dialog component so the file there stays focused
// on React state + render — same pattern used by
// `internal-clients.constants.ts` and `internal-packages-checks.constants.ts`.

// ─── Working-day pills ───────────────────────────────────────────────────
// 0=Sun … 6=Sat to match Date.getDay() — same convention the server
// uses in SchedulingConfig.workingDays. Order is Mon → Sun so the row
// reads like a calendar week.
export const SCHEDULING_DAY_PILLS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

// ─── Time dropdown range ──────────────────────────────────────────────────
// 10:00 AM through 10:00 PM in 30-minute steps — the time grain that
// matches the slot generator. User can pick any combination as long as
// start < end (validated server-side). 25 options total.
export const SCHEDULING_TIME_DROPDOWN_START_MIN = 10 * 60; // 10:00
export const SCHEDULING_TIME_DROPDOWN_END_MIN = 22 * 60; // 22:00

// Default minute-of-day values used both for the initial UI state and
// the fallback when the server returns a null lunch break (legacy
// rows from before the Settings dialog existed).
export const SCHEDULING_DEFAULT_WORKING_START_MIN = 600; // 10:00 AM
export const SCHEDULING_DEFAULT_WORKING_END_MIN = 1140; // 7:00 PM
export const SCHEDULING_DEFAULT_LUNCH_START_MIN = 840; // 2:00 PM
export const SCHEDULING_DEFAULT_LUNCH_END_MIN = 900; // 3:00 PM
