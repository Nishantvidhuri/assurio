'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface NumberCounterProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * RDS Number Counter — Figma node 3721:1478.
 *
 * Token mapping:
 * - Minus/Plus buttons: `bg-neutral-300`, `rounded-sm`, `size-4`
 * - Value chip: white bg, default border, `rounded-sm`, `min-w-[21px]`
 * - Value text: 10px regular, `text-text-body`
 */
export function NumberCounter({
  value,
  onChange,
  min = 1,
  max,
  step = 1,
  disabled = false,
  className,
}: NumberCounterProps) {
  const canDecrement = !disabled && value - step >= min;
  const canIncrement = !disabled && (max == null || value + step <= max);

  const handleDecrement = () => {
    if (!canDecrement) return;
    onChange(Math.max(min, value - step));
  };

  const handleIncrement = () => {
    if (!canIncrement) return;
    onChange(max == null ? value + step : Math.min(max, value + step));
  };

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        aria-label="Decrease value"
        onClick={handleDecrement}
        disabled={!canDecrement}
        className={cn(
          'flex size-4 items-center justify-center rounded-sm bg-neutral-300 text-icon-muted transition-colors',
          canDecrement ? 'hover:bg-neutral-400' : 'cursor-not-allowed opacity-60',
        )}
      >
        <Minus className="size-3" strokeWidth={2.25} />
      </button>

      <div className="flex min-w-[21px] items-center justify-center rounded-sm border border-border-default bg-white px-3 py-2">
        <span className="text-[10px] font-normal leading-none text-text-body">
          {value}
        </span>
      </div>

      <button
        type="button"
        aria-label="Increase value"
        onClick={handleIncrement}
        disabled={!canIncrement}
        className={cn(
          'flex size-4 items-center justify-center rounded-sm bg-neutral-300 text-primary transition-colors',
          canIncrement ? 'hover:bg-neutral-400' : 'cursor-not-allowed opacity-60',
        )}
      >
        <Plus className="size-3" strokeWidth={2.25} />
      </button>
    </div>
  );
}
