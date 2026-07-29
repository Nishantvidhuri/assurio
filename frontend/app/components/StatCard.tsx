import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * Recriauth-style summary card (see the Verification Queue page):
 * white bordered card, muted label on top, large value below, optional
 * delta / hint chip beside the value.
 */
export default function StatCard({
  label,
  value,
  chip,
  chipTone = 'neutral',
  className,
}: {
  label: string;
  value: ReactNode;
  chip?: string;
  chipTone?: 'success' | 'failure' | 'warning' | 'neutral';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border-default bg-white px-4 py-3',
        className,
      )}
    >
      <div className="text-body-sm text-text-placeholder">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-text-heading">{value}</span>
        {chip && (
          <span
            className={cn(
              'rounded-full px-1.5 py-[1px] text-body-sm font-medium',
              chipTone === 'success' && 'bg-[#edfff4] text-icon-success',
              chipTone === 'failure' && 'bg-[#fff0f0] text-failure',
              chipTone === 'warning' && 'bg-[#fff9ec] text-[#ffb522]',
              chipTone === 'neutral' && 'bg-neutral-400 text-text-body',
            )}
          >
            {chip}
          </span>
        )}
      </div>
    </div>
  );
}
