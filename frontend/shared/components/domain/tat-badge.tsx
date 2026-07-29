'use client';

import { cn } from '@/shared/lib/utils';
import { LiveDuration } from '@/shared/components/ui/live-duration';
import {
  formatTatDuration,
  resolveTatBadge,
  type TatSummary,
} from '@/shared/domain/tat';

// TAT indicator for a check / instance on the case-detail views (admin +
// client share the card components). Not a coloured pill — per Figma
// 3512:130840 it's a neutral rounded-md bordered box: subtle light fill,
// 1px default border, 12px text, "TAT:" in bold followed by the value.
// Ticks live while the clock is running; renders nothing when the clock
// never started (candidate hasn't submitted). The banner under the timeline
// explains when TAT begins, so there's no tooltip here.

const DURATION_UNITS = ['h', 'm'] as const;

export interface TatBadgeProps {
  tat: TatSummary | null | undefined;
  className?: string;
}

export function TatBadge({ tat, className }: TatBadgeProps) {
  const model = resolveTatBadge(tat);
  if (!model || !tat || tat.elapsedMs == null) return null;

  const elapsedMs = tat.elapsedMs;

  const durationNode = model.live ? (
    <LiveDuration
      anchoredMs={elapsedMs}
      paused={false}
      units={DURATION_UNITS as unknown as ('h' | 'm')[]}
      render={(liveMs) => <>{formatTatDuration(liveMs)}</>}
    />
  ) : (
    <>{formatTatDuration(elapsedMs)}</>
  );

  return (
    <span
      className={cn(
        // Neutral box per Figma 3512:130840 — 8px radius, 1px #EEEFF0 border,
        // and the soft blue radial glow pooling toward the bottom-right that
        // fades to near-white toward the top-left.
        'inline-flex items-center whitespace-nowrap rounded-md border border-border-default px-2.5 py-0.5',
        'bg-[radial-gradient(ellipse_at_bottom_right,#cddef4_0%,#e8edf8_42%,#f9fbff_78%)]',
        'text-[12px] leading-5 tracking-[0.25px]',
        model.breached ? 'text-failure' : 'text-text-body',
        className,
      )}
    >
      <span className="font-bold">TAT:</span>
      <span className="ml-1 font-medium">
        {model.leadIn ? `${model.leadIn} ` : ''}
        {durationNode}
      </span>
    </span>
  );
}
