// TAT (turnaround time) display model — shared by the internal (admin) and
// client case-detail views. The server computes the numbers (see
// server/.../queue-tat-context.ts); this decides how a single check /
// instance summary renders as a badge.

import { formatDuration } from '@/shared/utils/format-duration';

// Mirror of the server `TatSummary` (queue-tat-context.ts). One shape for
// case / check / instance so a single <TatBadge> renders any level.
export interface TatSummary {
  // Pause-adjusted working time. Null when the clock never started (the
  // candidate hasn't submitted this check's form) — the badge hides.
  elapsedMs: number | null;
  breached: boolean;
  overshootMs: number;
  thresholdMs: number;
  // Client must not tick the clock forward while true (terminal, weekend /
  // holiday, or blocked on candidate / client).
  paused: boolean;
  // Raw clock start (ISO) — for the tooltip only.
  startedAt: string | null;
  // Terminal stop (ISO) when closed, else null. Its presence is how the
  // badge picks "Completed in …" vs a live ticker.
  completedAt: string | null;
}

// Per-instance summary as the server emits it on each check.
export interface TatInstanceSummary {
  instanceKey: string;
  tat: TatSummary;
}

// Compact human duration: "45m", "3h", "3h 12m", "2d 4h". Drops the smaller
// unit when it's zero so the badge stays terse. Reuses the shared
// formatDuration so the padding / rounding rules match the queue column.
export function formatTatDuration(ms: number): string {
  const safe = ms > 0 ? ms : 0;
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  if (safe < HOUR) {
    return formatDuration(safe, {
      units: ['m'],
      unitSuffix: true,
      padFirst: false,
    });
  }
  if (safe < DAY) {
    const minutes = Math.floor((safe % HOUR) / MIN);
    return minutes === 0
      ? formatDuration(safe, { units: ['h'], unitSuffix: true, padFirst: false })
      : formatDuration(safe, {
          units: ['h', 'm'],
          unitSuffix: true,
          separator: ' ',
          padFirst: false,
        });
  }
  const remHours = Math.floor((safe % DAY) / HOUR);
  return remHours === 0
    ? formatDuration(safe, { units: ['d'], unitSuffix: true, padFirst: false })
    : formatDuration(safe, {
        units: ['d', 'h'],
        unitSuffix: true,
        separator: ' ',
        padFirst: false,
      });
}

export interface TatBadgeModel {
  // Whether the clock should keep ticking on the client (running & not paused).
  live: boolean;
  // Text shown between the bold "TAT:" and the duration. "Completed in" for a
  // closed check/instance; empty while it's still running.
  leadIn: string;
  // Over SLA → the duration renders in the failure colour (the box stays
  // neutral, matching the design).
  breached: boolean;
}

// Decide how a summary renders, or null when there is nothing to show
// (clock never started). The badge chrome is uniform (neutral bordered box,
// per Figma 3512:130840) — this only decides the wording + tick behaviour.
export function resolveTatBadge(
  tat: TatSummary | null | undefined,
): TatBadgeModel | null {
  if (!tat || tat.elapsedMs == null) return null;
  const completed = !!tat.completedAt;
  return {
    live: !completed && !tat.paused,
    leadIn: completed ? 'Completed in' : '',
    breached: tat.breached,
  };
}
