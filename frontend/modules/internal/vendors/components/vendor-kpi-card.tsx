import type { ReactNode } from 'react';
import { Tag } from '@/shared/components/ui';
import { useAnimatedNumber } from '@/modules/client/dashboard/hooks/use-animated-number';
import { DeltaBadge } from './delta-badge';

interface VendorKpiCardProps {
  label: string;
  /** Static display, used when `animate` is not provided. */
  value?: ReactNode;
  /**
   * Smoothly tweens the displayed value on mount and whenever it changes (the
   * client-dashboard "count up / scroll" feel). `value` is the number fed to
   * the tween (rounded to an integer per frame — scale percentages by 10 and
   * divide in `format` to keep one decimal); `format` renders each frame.
   */
  animate?: { value: number; format: (n: number) => string };
  /**
   * Current + previous raw numbers for the period-over-period delta badge.
   * When either is null/undefined the badge is omitted (e.g. success rate with
   * no calls in a window). Mirrors the client dashboard's comparison logic.
   */
  currentValue?: number | null;
  previousValue?: number | null;
  /** Muted note shown beside the value, e.g. "~18 days remaining". */
  subtext?: string | null;
  /**
   * Highlight card — applies the same decorative background as the client
   * dashboard's "Total Candidates" card.
   */
  highlight?: boolean;
}

export function VendorKpiCard({
  label,
  value,
  animate,
  currentValue,
  previousValue,
  subtext,
  highlight = false,
}: VendorKpiCardProps) {
  // Hook must run unconditionally; `disabled` snaps to target when we aren't
  // animating this card.
  const animated = useAnimatedNumber(animate?.value ?? 0, {
    disabled: !animate,
  });
  const display = animate ? animate.format(animated) : value;

  return (
    <div
      className={`relative flex flex-col gap-2 overflow-hidden rounded-md border bg-white p-4 ${
        highlight ? 'border-border-default' : 'border-neutral-300'
      }`}
      style={
        highlight
          ? {
              backgroundImage:
                "url('/assets/client-dashboard/total-candidates-background.png')",
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }
          : undefined
      }
    >
      <span className="text-body-md font-medium leading-5 tracking-body-md text-text-subheading">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[28px] font-semibold leading-[1.1] tracking-[-0.25px] text-text-body">
          {display}
        </span>
        <DeltaBadge currentValue={currentValue} previousValue={previousValue} />
        {subtext ? (
          <Tag variant="Warning" label={subtext} className="rounded-sm" />
        ) : null}
      </div>
    </div>
  );
}
