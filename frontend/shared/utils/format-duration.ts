// Generic duration formatter. Use this for any "h:m" / "d h m" / "2d 3h 5m"
// style display. The companion <LiveDuration /> component pairs it with a
// ticking interval; raw callers can format a snapshot directly via
// formatDuration(ms, options).
//
// Units render largest → smallest, in the order passed. Negative values
// are floored to 0 (caller decides how to display "negative" / overshoot).

export type DurationUnit = 'd' | 'h' | 'm' | 's';

const MS_PER = {
  d: 24 * 60 * 60 * 1000,
  h: 60 * 60 * 1000,
  m: 60 * 1000,
  s: 1000,
} as const;

export interface FormatDurationOptions {
  // Which fields to render, largest → smallest. Default ['h', 'm', 's'].
  units?: DurationUnit[];
  // Default ':'. Use ' ' with `unitSuffix: true` to get "2h 5m" style.
  separator?: string;
  // When true, append the unit letter after each number (2h 5m). When
  // false (default), digits-only joined by separator (02:05).
  unitSuffix?: boolean;
  // Zero-pad every field. Default true. When false the largest field is
  // not padded ("2:05" instead of "02:05") — small visual win when hours
  // can grow large.
  padFirst?: boolean;
}

export function formatDuration(
  ms: number,
  options: FormatDurationOptions = {},
): string {
  const safe = ms > 0 ? ms : 0;
  const units = options.units ?? ['h', 'm', 's'];
  const separator = options.separator ?? ':';
  const padFirst = options.padFirst ?? true;

  let remaining = safe;
  const parts: string[] = [];
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    const divisor = MS_PER[unit];
    // Last unit absorbs whatever remainder is left so the displayed sum
    // matches the input.
    const value =
      i === units.length - 1
        ? Math.floor(remaining / divisor)
        : Math.floor(remaining / divisor);
    remaining -= value * divisor;
    const padded =
      i === 0 && !padFirst
        ? value.toString()
        : value.toString().padStart(2, '0');
    parts.push(options.unitSuffix ? `${padded}${unit}` : padded);
  }
  return parts.join(separator);
}
