'use client';

import { useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { useClickOutside } from '@/shared/hooks/use-click-outside';
import { cn } from '@/shared/lib/utils';
import { Calendar } from './calendar';
import { Button } from './button';
import { ButtonContainer } from './button-container';

/**
 * RDS DateRangeInput — Figma nodes 6689:61138 (preset menu) + RDS 3183:7777 (calendar range).
 *
 * A date-range filter chip that opens a popover with:
 * 1. Preset options (Today, Last 7 Days, Last 30 Days, etc.)
 * 2. "Custom Range" mode showing a two-month calendar with range selection
 *
 * Uses the shared Calendar component with `mode="range"` + `numberOfMonths={2}`.
 * Footer: Cancel + Apply buttons using base Button + ButtonContainer.
 */

export interface DateRangeValue {
  from: Date;
  to: Date;
}

export interface DateRangeInputProps {
  value?: DateRangeValue | null;
  onChange?: (range: DateRangeValue | null) => void;
  label?: string;
  className?: string;
}

interface Preset {
  id: string;
  label: string;
  getRange: () => DateRangeValue;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

const PRESETS: Preset[] = [
  {
    id: 'today',
    label: 'Today',
    getRange: () => {
      const now = new Date();
      return { from: startOfDay(now), to: endOfDay(now) };
    },
  },
  {
    id: 'last-7-days',
    label: 'Last 7 Days',
    getRange: () => {
      const to = endOfDay(new Date());
      const from = startOfDay(new Date());
      from.setDate(from.getDate() - 6);
      return { from, to };
    },
  },
  {
    id: 'last-30-days',
    label: 'Last 30 Days',
    getRange: () => {
      const to = endOfDay(new Date());
      const from = startOfDay(new Date());
      from.setDate(from.getDate() - 29);
      return { from, to };
    },
  },
  {
    id: 'last-6-months',
    label: 'Last 6 Months',
    getRange: () => {
      const to = endOfDay(new Date());
      const from = startOfDay(new Date());
      from.setMonth(from.getMonth() - 6);
      return { from, to };
    },
  },
  {
    id: 'last-1-year',
    label: 'Last 1 Year',
    getRange: () => {
      const to = endOfDay(new Date());
      const from = startOfDay(new Date());
      from.setFullYear(from.getFullYear() - 1);
      return { from, to };
    },
  },
];

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function DateRangeInput({
  value,
  onChange,
  label = 'Date',
  className,
}: DateRangeInputProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'presets' | 'custom'>('presets');
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(
    value ? { from: value.from, to: value.to } : undefined,
  );
  const rootRef = useRef<HTMLDivElement>(null);

  useClickOutside(rootRef, () => {
    setOpen(false);
    setMode('presets');
  });

  const isApplied = !!value;

  const handlePresetClick = (preset: Preset) => {
    const range = preset.getRange();
    onChange?.(range);
    setOpen(false);
    setMode('presets');
  };

  const handleCustomRangeClick = () => {
    setDraftRange(value ? { from: value.from, to: value.to } : undefined);
    setMode('custom');
  };

  const handleApply = () => {
    if (draftRange?.from && draftRange?.to) {
      onChange?.({
        from: startOfDay(draftRange.from),
        to: endOfDay(draftRange.to),
      });
    }
    setOpen(false);
    setMode('presets');
  };

  const handleCancel = () => {
    setMode('presets');
  };

  const handleClear = () => {
    onChange?.(null);
    setOpen(false);
    setMode('presets');
  };

  const chipLabel = isApplied
    ? `${formatShortDate(value.from)} – ${formatShortDate(value.to)}`
    : label;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="flex items-center">
        {isApplied && !open ? (
          <div className="flex items-center pr-px">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-8 items-center gap-2 rounded-l-[24px] border border-neutral-500 bg-neutral-200 px-3"
            >
              <CalendarDays className="size-4 text-text-body" />
              <span className="text-body-sm font-medium leading-[20px] tracking-body-sm text-text-body">
                {chipLabel}
              </span>
            </button>
            <button
              type="button"
              aria-label="Clear date filter"
              onClick={handleClear}
              className="inline-flex h-8 items-center justify-center rounded-r-[24px] border border-l-0 border-neutral-500 bg-neutral-200 px-2"
            >
              <span className="text-body-sm text-text-body">✕</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-[24px] border border-neutral-500 bg-neutral-200 px-3 py-[6px]"
          >
            <CalendarDays className="size-4 text-text-body" />
            <span className="text-body-sm font-medium leading-[20px] tracking-body-sm text-text-body">
              {label}
            </span>
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1">
          {mode === 'presets' ? (
            <div className="bg-white border border-neutral-500 rounded-md shadow-[0px_3px_10px_0px_rgba(11,26,59,0.06)] py-1 w-[180px]">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetClick(preset)}
                  className="w-full px-3 py-2 text-left text-body-md font-medium text-text-body hover:bg-neutral-200 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={handleCustomRangeClick}
                className="w-full px-3 py-2 text-left text-body-md font-medium text-text-link hover:bg-neutral-200 transition-colors"
              >
                Custom Range
              </button>
            </div>
          ) : (
            <div className="bg-white border border-neutral-500 rounded-md shadow-[0px_3px_10px_0px_rgba(11,26,59,0.06)] flex flex-col">
              <Calendar
                mode="range"
                selected={draftRange}
                onSelect={setDraftRange}
                numberOfMonths={2}
                className="border-0 shadow-none"
              />
              <ButtonContainer
                alignment="Right"
                configuration="With Padding"
              >
                <Button variant="secondary" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleApply}
                  disabled={!draftRange?.from || !draftRange?.to}
                >
                  Apply
                </Button>
              </ButtonContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
