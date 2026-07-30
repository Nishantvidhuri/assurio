import type { VendorRange } from './dto/vendor-analytics-query.dto';

export interface ResolvedRange {
  from: Date;
  to: Date;
  /** Start of the immediately-preceding equal-length window (for trend %). */
  previousFrom: Date;
  /** End of the preceding window (== `from`). */
  previousTo: Date;
  days: number;
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const RANGE_DAYS: Record<VendorRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const RANGE_LABEL: Record<VendorRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
};

/**
 * Resolves the analytics window. An explicit `from`/`to` wins; otherwise the
 * `range` preset is anchored to "now". Always yields the preceding equal-length
 * window so callers can compute period-over-period trend percentages.
 */
export function resolveRange(input: {
  range?: VendorRange;
  from?: string;
  to?: string;
}): ResolvedRange {
  const preset = input.range ?? '30d';
  const to = input.to ? new Date(input.to) : new Date();
  const from = input.from
    ? new Date(input.from)
    : new Date(to.getTime() - RANGE_DAYS[preset] * DAY_MS);

  const spanMs = Math.max(to.getTime() - from.getTime(), DAY_MS);
  // An explicit from/to defines a custom window whose length the preset no
  // longer describes, so derive the day-count from the actual span (drives
  // avg-daily-spend, runway, and amortized subscription cost).
  const days =
    input.from || input.to
      ? Math.max(1, Math.round(spanMs / DAY_MS))
      : RANGE_DAYS[preset];
  const previousTo = from;
  const previousFrom = new Date(from.getTime() - spanMs);

  return {
    from,
    to,
    previousFrom,
    previousTo,
    days,
    label: input.from || input.to ? 'Custom range' : RANGE_LABEL[preset],
  };
}

/**
 * Period-over-period change as a signed percentage rounded to 1 dp. Returns
 * null when there's no prior-period baseline to compare against.
 */
export function trendPct(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Inclusive list of YYYY-MM-DD day buckets spanning [from, to). */
export function dayBuckets(from: Date, to: Date): string[] {
  const buckets: string[] = [];
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = to.getTime();
  while (cursor.getTime() < end) {
    buckets.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return buckets;
}

/** First day of the current calendar month (UTC) — for MTD aggregates. */
export function startOfMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
