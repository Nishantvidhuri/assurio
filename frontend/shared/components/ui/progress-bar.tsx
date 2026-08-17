'use client';

import { cn } from '@/shared/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════════
 * A rounded track with a `bg-primary` fill that animates on width change,
 * plus an optional trailing percentage label (e.g. "33%").
 *
 * @example
 * ```tsx
 * <ProgressBar value={33} showLabel />
 * ```
 * ═══════════════════════════════════════════════════════════════════════ */

export interface ProgressBarProps {
  /** Progress percentage, 0–100. Values outside the range are clamped. */
  value: number;
  /** Show the rounded percentage label at the end of the bar. */
  showLabel?: boolean;
  /** Extra classes for the outer wrapper. */
  className?: string;
  /** Extra classes for the track element. */
  trackClassName?: string;
}

export function ProgressBar({
  value,
  showLabel = false,
  className,
  trackClassName,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div
        className={cn(
          'h-2 flex-1 overflow-hidden rounded-full bg-neutral-500',
          trackClassName,
        )}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel ? (
        <span className="shrink-0 text-body-sm font-medium text-text-body">
          {Math.round(clamped)}%
        </span>
      ) : null}
    </div>
  );
}
