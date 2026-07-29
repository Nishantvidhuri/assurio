// Wire types for the Settings dialog on the Verification Schedule page.
// Mirror the server-side shapes in scheduling-config.controller.ts —
// keep them in lock-step so a contract drift surfaces at the TS layer
// rather than at runtime.

export interface SchedulingConfig {
  // IANA timezone identifier (e.g. 'Asia/Kolkata'). Default = 'Asia/Kolkata'.
  timezone: string;
  // ISO-weekday slot in JS Date.getDay() semantics: 0=Sun, 1=Mon, …, 6=Sat.
  workingDays: number[];
  // Working hours window as minute-of-day [start, end). 0–1440.
  workingStartMinutes: number;
  workingEndMinutes: number;
  // Lunch break: either both null (no break) or both numbers.
  lunchStartMinutes: number | null;
  lunchEndMinutes: number | null;
  updatedAt: string;
}

export interface SchedulingConfigUpdate {
  timezone: string;
  workingDays: number[];
  workingStartMinutes: number;
  workingEndMinutes: number;
  lunchStartMinutes: number | null;
  lunchEndMinutes: number | null;
}

export interface SchedulingHoliday {
  id: string;
  name: string;
  // YYYY-MM-DD on the IST calendar — the DateInput component round-trips
  // this without timezone wrangling.
  date: string;
}

export interface SchedulingHolidayInput {
  name: string;
  date: string; // YYYY-MM-DD
}

export interface SchedulingHolidaysList {
  items: SchedulingHoliday[];
}
