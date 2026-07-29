'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useAnimatedToggle } from '@/shared/hooks/use-animated-toggle';
import type { DateRange } from 'react-day-picker';
import { Button } from './button';
import { ButtonContainer } from './button-container';
import { Calendar } from './calendar';
import { Checkbox } from './checkbox';
import { Menu, type MenuOption } from './menu';
import { useClickOutside } from '@/shared/hooks/use-click-outside';
import { cn } from '@/shared/lib/utils';
import { Divider } from './divider';
import { SvgIcon } from './svg-icon';
import chevronIcon from '@/public/assets/icons/chevron-down-medium/Chevron_Down_Medium=16px.svg'
import closeIcon from '@/public/assets/icons/close-sm/Close_SM=16px.svg'

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterChipProps {
  label: string;
  options: FilterOption[];
  selectedValues?: string[];
  onSelectionChange?: (values: string[]) => void;
  className?: string;
  menuClassName?: string;
  /** Cap on the dropdown menu's height in px. Defaults to 240. */
  menuMaxHeight?: number;
}

/**
 * RDS Filter Chip — Figma nodes 3355:1415 (RDS)
 *
 * States:
 * - Default: no selected value
 * - Active: dropdown open
 * - Applied: one or more selected values
 */
export function FilterChip({
  label,
  options,
  selectedValues = [],
  onSelectionChange,
  className,
  menuClassName,
  menuMaxHeight = 240,
}: FilterChipProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { shouldRender: menuVisible, isVisible: menuAnimated } = useAnimatedToggle(open, 300);

  useClickOutside(rootRef, () => setOpen(false));

  const count = selectedValues.length;
  const isApplied = count > 0;
  const isActive = open;

  function toggleValue(value: string) {
    const next = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value];
    onSelectionChange?.(next);
  }

  const menuItems: MenuOption[] = options.map((option) => ({
    id: option.value,
    menuText: option.label,
    leadingElement: (
      <Checkbox
        size="Small"
        checked={selectedValues.includes(option.value)}
        nonInteractive
        disableHoverEffect
      />
    ),
    onClick: () => toggleValue(option.value),
    buttonClassName: 'pl-[14px] py-2.5 pr-3'
  }));

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {isApplied ? (
        <div className="flex items-center pr-px">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn("inline-flex h-8 items-center gap-1 rounded-l-[24px] border bg-neutral-200 px-3", isActive ? "border-primary" : "border-neutral-500")}
          >
            <span className="inline-flex items-center gap-0 text-body-sm font-medium leading-[20px] tracking-body-sm text-text-body">
              <span>{label}</span>
              <span>({count})</span>
            </span>
            <span className={cn('inline-flex transition-transform duration-400', isActive && '-rotate-180')}>
              <SvgIcon src={chevronIcon} color='text-text-body' />
            </span>
          </button>
          <button
            type="button"
            aria-label={`Clear ${label} filter`}
            onClick={() => onSelectionChange?.([])}
            className={cn("inline-flex h-8 items-center justify-center rounded-r-[24px] border border-l-0 bg-neutral-200 px-2", isActive ? "border-primary" : "border-neutral-500")}
          >
            <SvgIcon src={closeIcon} color='text-text-body' />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn("inline-flex items-center gap-2 rounded-[24px] border bg-neutral-200 px-3 py-[6px] h-8", isActive ? "border-primary" : "border-neutral-500")}
        >
          <span className="inline-flex items-center gap-0 text-body-sm font-medium leading-[20px] tracking-body-sm text-text-body">
            <span>{label}</span>
          </span>
          <span className={cn('inline-flex transition-transform duration-400', isActive && '-rotate-180')}>
            <SvgIcon src={chevronIcon} color='text-text-body' />
          </span>
        </button>
      )}

      {menuVisible && (
        <div
          className={cn(
            'absolute left-0 top-full z-30 mt-1 transition-all duration-400 origin-top',
            menuAnimated
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 -translate-y-2',
          )}
        >
          <Menu
            className={cn('w-fit min-w-[180px]', menuClassName)}
            maxHeight={menuMaxHeight}
            showScrollbar
            items={menuItems}
          />
        </div>
      )}
    </div>
  );
}

export interface FilterRowItem {
  id: string;
  label: string;
  options: FilterOption[];
  selectedValues?: string[];
  onSelectionChange?: (values: string[]) => void;
  menuMaxHeight?: number;
  menuClassName?: string;
}

export interface FilterRowProps {
  filters: FilterRowItem[];
  /** Extra filter elements rendered after filter chips (e.g. DateFilterChip) */
  children?: ReactNode;
  /** Whether extra filters (outside `filters` array) are active — used for Clear All visibility */
  hasExtraActiveFilters?: boolean;
  title?: string;
  clearAllLabel?: string;
  onClearAll?: () => void;
  className?: string;
}

/**
 * Filter Row — Figma node 5060:43407
 */
export function FilterRow({
  filters,
  children,
  hasExtraActiveFilters = false,
  title = 'Filters:',
  clearAllLabel = 'Clear All',
  onClearAll,
  className,
}: FilterRowProps) {
  const hasAppliedFilters =
    hasExtraActiveFilters ||
    filters.some((filter) => (filter.selectedValues?.length ?? 0) > 0);

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex items-center gap-3">
        <p className="text-subtitle-sm font-medium leading-[20px] tracking-body-md text-text-body">
          {title}
        </p>

        <div className="flex items-center gap-2">
          {filters.map((filter) => (
            <FilterChip
              key={filter.id}
              label={filter.label}
              options={filter.options}
              selectedValues={filter.selectedValues}
              onSelectionChange={filter.onSelectionChange}
              menuMaxHeight={filter.menuMaxHeight}
              menuClassName={filter.menuClassName}
            />
          ))}
          {children}
        </div>

        {hasAppliedFilters && onClearAll ? (
          <Button variant="link" onClick={onClearAll} className='text-body-md'>
            {clearAllLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Date Filter Chip ─────────────────────────────────────────────── */

export interface DateRangeValue {
  from: Date;
  to: Date;
}

export interface DateFilterChipProps {
  label?: string;
  value?: DateRangeValue | null;
  onChange?: (range: DateRangeValue | null) => void;
  className?: string;
  /**
   * When false, hides the trailing × clear button on the applied chip. The
   * range can still be changed via the popover. Defaults to true.
   */
  clearable?: boolean;
  /**
   * Horizontal alignment of the popover relative to the trigger. Use 'end'
   * when the chip sits near the right edge of the page so the 620px custom
   * calendar doesn't overflow the viewport. Defaults to 'start'.
   */
  align?: 'start' | 'end';
  showPresetLabels?: boolean;
  labelClassName?: string;
}

interface DatePreset {
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

const DATE_PRESETS: DatePreset[] = [
  {
    id: 'today',
    label: 'Today',
    getRange: () => {
      const now = new Date();
      return { from: startOfDay(now), to: endOfDay(now) };
    },
  },
  {
    id: 'yesterday',
    label: 'Yesterday',
    getRange: () => {
      const from = startOfDay(new Date());
      from.setDate(from.getDate() - 1);
      const to = endOfDay(new Date(from));
      return { from, to };
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
    id: 'last-3-months',
    label: 'Last 3 Months',
    getRange: () => {
      const to = endOfDay(new Date());
      const from = startOfDay(new Date());
      from.setMonth(from.getMonth() - 3);
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

/**
 * RDS DateFilterChip — uses FilterChip visual style with date range picker popover.
 *
 * Matches Figma nodes 6689:61138 (preset menu) + RDS 3183:7777 (calendar range).
 * Uses the same pill/chip styling as FilterChip for visual consistency in FilterRow.
 */
export function DateFilterChip({
  label = 'Date',
  value,
  onChange,
  className,
  clearable = true,
  align = 'start',
  showPresetLabels = false,
  labelClassName,
}: DateFilterChipProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'presets' | 'custom'>('presets');
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(
    value ? { from: value.from, to: value.to } : undefined,
  );
  // Controlled month state for the two side-by-side calendars. Anchored to
  // the draftRange when present so opening a 6 Jun → 18 Aug range lands on
  // June (left) and August (right), instead of always defaulting to the
  // current month + current+1. Each calendar still has its own next/prev
  // chevrons via onMonthChange.
  const monthsForRange = (range: DateRange | undefined) => {
    const left = range?.from
      ? new Date(range.from.getFullYear(), range.from.getMonth(), 1)
      : new Date();
    const leftAnchor = new Date(left.getFullYear(), left.getMonth(), 1);
    const right =
      range?.to &&
      (range.to.getFullYear() !== leftAnchor.getFullYear() ||
        range.to.getMonth() !== leftAnchor.getMonth())
        ? new Date(range.to.getFullYear(), range.to.getMonth(), 1)
        : new Date(leftAnchor.getFullYear(), leftAnchor.getMonth() + 1, 1);
    return { left: leftAnchor, right };
  };
  const initialMonths = monthsForRange(value ?? undefined);
  const [leftMonth, setLeftMonth] = useState<Date>(initialMonths.left);
  const [rightMonth, setRightMonth] = useState<Date>(initialMonths.right);
  const rootRef = useRef<HTMLDivElement>(null);
  const { shouldRender: dateMenuVisible, isVisible: dateMenuAnimated } = useAnimatedToggle(open, 300);

  useClickOutside(rootRef, () => {
    setOpen(false);
    setMode('presets');
  });

  const isApplied = !!value;

  const formatChipDate = (d: Date) =>
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

  // Identify which preset (if any) the current value matches so we can mark
  // it as selected when the dropdown opens. Comparing by day-precision
  // bounds is more forgiving than exact ms equality (the user may have
  // picked a preset yesterday; "Today"'s boundaries have shifted but their
  // custom value is still effectively the last 7 days).
  const matchedPresetId: string | null = (() => {
    if (!value) return null;
    for (const preset of DATE_PRESETS) {
      const candidate = preset.getRange();
      if (
        startOfDay(candidate.from).getTime() ===
          startOfDay(value.from).getTime() &&
        endOfDay(candidate.to).getTime() === endOfDay(value.to).getTime()
      ) {
        return preset.id;
      }
    }
    return null;
  })();
  // Anything that doesn't match a preset is by definition "custom".
  const isCustomValue = isApplied && matchedPresetId === null;

  const matchedPreset =
    matchedPresetId !== null
      ? DATE_PRESETS.find((preset) => preset.id === matchedPresetId) ?? null
      : null;

  const appliedLabel = !isApplied
    ? null
    : showPresetLabels && matchedPreset
      ? matchedPreset.label
      : `${formatChipDate(value.from)} – ${formatChipDate(value.to)}`;

  const handlePresetClick = (preset: DatePreset) => {
    onChange?.(preset.getRange());
    setOpen(false);
    setMode('presets');
  };

  const handleCustomRangeClick = () => {
    const next = value ? { from: value.from, to: value.to } : undefined;
    setDraftRange(next);
    const months = monthsForRange(next);
    setLeftMonth(months.left);
    setRightMonth(months.right);
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

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {isApplied ? (
        <div className="flex items-center pr-px">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'inline-flex h-8 items-center gap-1 border border-neutral-500 bg-neutral-200 px-3',
              clearable ? 'rounded-l-[24px]' : 'rounded-[24px]',
              open ? "border-primary" : "border-neutral-500"
            )}
          >
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[12px] font-medium leading-[20px] tracking-body-sm text-text-body',
                labelClassName,
              )}
            >
              {showPresetLabels && matchedPreset ? null : (
                <span>{label}:</span>
              )}
              <span>{appliedLabel}</span>
            </span>
            <span className={cn('inline-flex transition-transform duration-400', open && '-rotate-180')}>
              <SvgIcon src={chevronIcon} color='text-text-body' alt='Chevron Down' />
            </span>
          </button>
          {clearable ? (
            <button
              type="button"
              aria-label="Clear date filter"
              onClick={handleClear}
              className={cn("inline-flex h-8 items-center justify-center rounded-r-[24px] border border-l-0 bg-neutral-200 px-2", open ? "border-primary" : "border-neutral-500")}
            >
              <SvgIcon src={closeIcon} color='text-text-body' alt='Close' />
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn("inline-flex items-center gap-2 rounded-[24px] border bg-neutral-200 px-3 py-[6px] h-8", open ? "border-primary" : "border-neutral-500")}
        >
          <span className="text-body-sm font-medium leading-[20px] tracking-body-sm text-text-body">
            {label}
          </span>
          <span className={cn('inline-flex transition-transform duration-400', open && '-rotate-180')}>
            <SvgIcon src={chevronIcon} color='text-text-body' alt='Chevron Down' />
          </span>
        </button>
      )}

      {dateMenuVisible && (
      <div
        className={cn(
          'absolute top-full z-30 mt-1 transition-all duration-300 origin-top',
          align === 'end' ? 'right-0' : 'left-0',
          dateMenuAnimated
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-2',
        )}
      >
          {mode === 'presets' ? (
            <div className="bg-white border border-neutral-500 rounded-md shadow-[0px_3px_10px_0px_rgba(11,26,59,0.06)] py-1 w-[180px]">
              {DATE_PRESETS.map((preset) => {
                const isSelected = matchedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetClick(preset)}
                    aria-pressed={isSelected}
                    className={cn(
                      'w-full px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-primary-bg',
                      isSelected
                        ? 'bg-primary-bg text-text-body'
                        : 'text-text-body',
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleCustomRangeClick}
                aria-pressed={isCustomValue}
                className={cn(
                  'w-full px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-primary-bg',
                  isCustomValue
                    ? 'bg-primary-bg text-text-link'
                    : 'text-text-link',
                )}
              >
                Custom Range
              </button>
            </div>
          ) : (
            <div className="bg-white border border-neutral-500 rounded-md shadow-[0px_3px_10px_0px_rgba(11,26,59,0.06)] flex flex-col w-[620px]">
              <div className="flex gap-0">
                <Calendar
                  mode="range"
                  selected={draftRange}
                  onSelect={(_range, clickedDate) => {
                    if (!clickedDate) return;
                    setDraftRange((prev) => ({
                      from: clickedDate,
                      to: prev?.to,
                    }));
                  }}
                  disabled={
                    draftRange?.to
                      ? (d: Date) => d.getTime() >= draftRange.to!.getTime()
                      : undefined
                  }
                  endMonth={draftRange?.to}
                  numberOfMonths={1}
                  month={leftMonth}
                  onMonthChange={setLeftMonth}
                  showOutsideDays
                  classNames={{
                    outside: 'bg-white! bg-none! text-text-disabled font-medium pointer-events-none [&>button]:bg-white! [&>button]:text-text-disabled! [&>button]:font-medium! [&>button]:border-none! [&>button]:outline-none! [&>button]:shadow-none! opacity-60 border-none! outline-none! shadow-none! [background-image:none!important]',
                  }}
                  className="border-0 shadow-none flex-1"
                />
                <Divider orientation="Vertical" className="self-stretch h-auto my-3" />
                <Calendar
                  mode="range"
                  selected={draftRange}
                  onSelect={(_range, clickedDate) => {
                    if (!clickedDate) return;
                    setDraftRange((prev) => ({
                      from: prev?.from,
                      to: clickedDate,
                    }));
                  }}
                  disabled={
                    draftRange?.from
                      ? (d: Date) => d.getTime() <= draftRange.from!.getTime()
                      : undefined
                  }
                  startMonth={draftRange?.from}
                  numberOfMonths={1}
                  month={rightMonth}
                  onMonthChange={setRightMonth}
                  showOutsideDays
                  classNames={{
                    outside: 'bg-white! bg-none! text-text-disabled pointer-events-none [&>button]:bg-white! [&>button]:text-text-disabled! [&>button]:border-none! [&>button]:outline-none! [&>button]:shadow-none! opacity-40 border-none! outline-none! shadow-none! [background-image:none!important]',
                  }}
                  className="border-0 shadow-none flex-1"
                />
              </div>
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
