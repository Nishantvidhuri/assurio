'use client';

import { useEffect, useMemo, useState, type HTMLAttributes } from 'react';
import {
  formatDuration,
  type DurationUnit,
  type FormatDurationOptions,
} from '@/shared/utils/format-duration';

// Reusable live-ticking duration display.
//
// Same anchored-extrapolation pattern as the invite countdown in
// client/users/components/users-table.tsx:142 — we snapshot the server's
// elapsed value at mount and add wall-clock time on each tick, so a 1Hz
// (or slower) interval is enough for visual accuracy without per-second
// server polling.
//
// Reuse cases:
//   - TAT clock in the verification queue (h:m, paused on insufficiency)
//   - Invite countdown (s, pauseable when accepted)
//   - "Call in progress for…" timers (m:s)
//   - Any "started X ago" display where wall-clock progress matters

export interface LiveDurationProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  // Snapshot ms at the time the parent rendered this row. The component
  // anchors mount time to this value and extrapolates forward.
  anchoredMs: number;
  // When true, freezes on anchoredMs without ticking. Use for paused
  // states (e.g. open insufficiency, weekend window, completed case).
  paused?: boolean;
  // Which fields to show, largest → smallest. Default ['h', 'm', 's'].
  units?: DurationUnit[];
  // Passed through to formatDuration. Defaults: ':' separator, no suffix,
  // padFirst=true.
  formatOptions?: Omit<FormatDurationOptions, 'units'>;
  // Override the auto-picked tick cadence. Auto-picks based on smallest
  // unit: 's' → 1s, 'm' → 60s, 'h' → 60s (so the display flips at the
  // minute boundary), 'd' → 60s.
  tickIntervalMs?: number;
  // Optional transform — receives the live ms and returns whatever you
  // want to render (e.g. the breach-overshoot styling for TAT). When
  // omitted, renders the formatted string in a plain span.
  render?: (liveMs: number) => React.ReactNode;
}

function defaultIntervalFor(units: DurationUnit[]): number {
  const smallest = units[units.length - 1];
  if (smallest === 's') return 1000;
  return 60_000;
}

export function LiveDuration({
  anchoredMs,
  paused = false,
  units = ['h', 'm', 's'],
  formatOptions,
  tickIntervalMs,
  render,
  ...rest
}: LiveDurationProps) {
  const [anchor] = useState(() => ({
    anchoredMs,
    mountedAt: Date.now(),
  }));
  const [liveMs, setLiveMs] = useState(anchoredMs);

  // Resolve the tick cadence to a stable primitive BEFORE the effect. If
  // we depended on `units` directly, the parent's `units={['h','m']}`
  // literal would change reference on every render, restart the
  // setInterval on every parent re-render, and prevent the timer from
  // ever firing on pages that re-render < tick frequency (SSE events,
  // unrelated state changes, etc.).
  const tick = useMemo(
    () => tickIntervalMs ?? defaultIntervalFor(units),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tickIntervalMs, units.join(',')],
  );

  useEffect(() => {
    if (paused) {
      setLiveMs(anchoredMs);
      return;
    }
    const id = setInterval(() => {
      setLiveMs(anchor.anchoredMs + (Date.now() - anchor.mountedAt));
    }, tick);
    return () => clearInterval(id);
  }, [anchor, paused, anchoredMs, tick]);

  // Re-anchor when the parent passes a new server value (refresh / SSE).
  // Without this the ticker would drift further from server truth on each
  // pause/resume cycle.
  useEffect(() => {
    anchor.anchoredMs = anchoredMs;
    anchor.mountedAt = Date.now();
    setLiveMs(anchoredMs);
  }, [anchoredMs, anchor]);

  if (render) {
    return <>{render(liveMs)}</>;
  }
  return <span {...rest}>{formatDuration(liveMs, { ...formatOptions, units })}</span>;
}
