import { formatDistanceToNow } from 'date-fns';

const ABSOLUTE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const absoluteFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// Full timestamp — used for tooltips and as the display for older entries.
export function formatAbsoluteTime(value: string | Date): string {
  return absoluteFormatter.format(new Date(value));
}

// "3 minutes ago" for recent entries, absolute date beyond a week (relative
// phrasing stops being useful at that distance).
export function formatRelativeTime(value: string | Date): string {
  const date = new Date(value);
  if (Date.now() - date.getTime() > ABSOLUTE_AFTER_MS) {
    return formatAbsoluteTime(date);
  }
  return formatDistanceToNow(date, { addSuffix: true });
}

// Compact dashboard-style relative time for tight table cells where the
// verbose "3 minutes ago" doesn't fit. Output ladder:
//   < 1m       → "Just now"
//   < 1h       → "<N>m ago"
//   < 24h      → "<N>h ago"
//   < 48h      → "Yesterday"
//   < 7d       → "<N>d ago"
//   ≥ 7d       → locale date string
// Returns "—" for unparseable input so callers can render the result
// directly in a cell without their own guard. Use `formatRelativeTime`
// instead when you have room for the full phrasing (timelines, logs).
export function formatCompactRelativeTime(value: string | Date): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffHr < 48) return 'Yesterday';
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(then).toLocaleDateString();
}
