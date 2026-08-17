'use client';

import * as React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/shared/lib/utils';
import { useClickOutside } from '@/shared/hooks/use-click-outside';
import { Menu } from './menu';
import { SvgIcon } from './svg-icon';
import chevronDownIcon from '@/public/assets/icons/chevron-down-medium/Chevron_Down_Medium=24px.svg'

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Custom dropdown using Menu component to replace native <select>.
 */
function CalendarDropdown({
  value,
  onChange,
  options,
  className,
}: {
  value?: string | number | undefined | string[] | number[];
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  options?: { value: string | number; label: string; disabled?: boolean }[];
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const menuContainerRef = React.useRef<HTMLDivElement>(null);

  // The Calendar is itself rendered inside a Radix popover, so clicks on
  // sibling popover surfaces (e.g. calendar days) need to close this nested
  // dropdown — opt out of the default Radix-portal exclusion.
  useClickOutside(ref, () => setOpen(false), { ignoreRadixPortal: false });

  // Scroll to selected item when dropdown opens
  React.useEffect(() => {
    if (open && menuContainerRef.current) {
      // Find the item with bg-primary class (selected item)
      const selectedEl = menuContainerRef.current.querySelector('.bg-primary');
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'center' });
      }
    }
  }, [open]);

  const selectedOption = options?.find((o) => String(o.value) === String(value));

  const menuItems = (options ?? []).map((opt) => ({
    id: String(opt.value),
    menuText: opt.label,
    state: String(opt.value) === String(value) ? ('On Hover' as const) : ('Default' as const),
    onClick: () => {
      if (onChange) {
        const syntheticEvent = {
          target: { value: String(opt.value) },
        } as React.ChangeEvent<HTMLSelectElement>;
        onChange(syntheticEvent);
      }
      setOpen(false);
    },
    className: String(opt.value) === String(value) ? 'bg-primary' : '',
    menuTextClassName: String(opt.value) === String(value) ? 'text-white' : '',
  }));

  return (
    <div ref={ref} className={cn('relative inline-flex items-center', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-0.5 text-body-md font-medium text-text-body cursor-pointer"
      >
        {selectedOption?.label ?? value}
        <SvgIcon
          src={chevronDownIcon}
          size={5}
          className={cn(
            'transition-transform duration-400 ease-in-out',
            open && '-rotate-180',
          )}
        />
      </button>

      {open && (
        <div ref={menuContainerRef} className="absolute top-full left-0 z-[100] mt-1">
          <Menu
            items={menuItems}
            className="w-[100px]"
            maxHeight={200}
            showScrollbar
          />
        </div>
      )}
    </div>
  );
}

/**
 * RDS Calendar — styled to match Figma node 3172:2444 calendar popover.
 *
 * Token mapping:
 *   Container: bg-white, border: neutral-500 (#e2e8f0), rounded-md,
 *              shadow: 0px 3px 10px rgba(11,26,59,0.06), p-3, gap-2
 *   Header nav: ChevronLeft/Right 20px, text-text-body
 *   Month caption: text-body-md, font-medium, text-text-body
 *   Weekday headers: text-body-sm, font-medium, text-text-subheading, tracking-body-sm
 *   Day cells: w-8 h-8 (32px), rounded-md, text-body-sm (12px), font-medium (500)
 *   Normal day: text-text-body
 *   Outside day: text-text-disabled
 *   Selected day: bg-primary (#174ab5), text-white
 *   Today: bg-neutral-400
 *   Disabled: text-text-disabled opacity-50
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  // Always render 6 week rows so the popover height stays constant
  // across months — 5-week months get padded with outside days from
  // the next month (greyed out via the `outside` className below).
  // Caller can opt out by passing `fixedWeeks={false}` explicitly.
  fixedWeeks = true,
  formatters,
  components,
  ...props
}: CalendarProps) {
  const isMultiMonth = (props.numberOfMonths ?? 1) > 1;

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      fixedWeeks={fixedWeeks}
      captionLayout="dropdown"
      navLayout="around"
      hideNavigation={isMultiMonth}
      // Round the FIRST and LAST date of every month via custom modifiers
      // — the CSS `:has(+.rdp-day-outside)` / `.rdp-day-outside+&` selectors
      // alone weren't applying in all browsers (Safari + some Chrome
      // versions skip `:has()` with sibling combinators). Modifier classes
      // append directly to the td, so the rounding lands regardless of
      // selector support. The `!` prefix beats `rounded-none` on
      // range_middle / range_start / range_end so the corner clip wins.
      modifiers={{
        monthStart: (date) => date.getDate() === 1,
        monthEnd: (date) => {
          const next = new Date(date);
          next.setDate(next.getDate() + 1);
          return next.getMonth() !== date.getMonth();
        },
      }}
      modifiersClassNames={{
        monthStart: '!rounded-l-md',
        monthEnd: '!rounded-r-md',
      }}
      className={cn(
        'bg-white border border-neutral-500 rounded-md shadow-[0px_3px_10px_0px_rgba(11,26,59,0.06)] p-3',
        className,
      )}
      classNames={{
        months: 'flex gap-4',
        month: cn(
          'relative grid flex-1 items-center gap-x-2 gap-y-2',
          isMultiMonth
            ? 'grid-cols-1'
            : 'grid-cols-[auto_minmax(0,1fr)_auto]',
        ),
        month_caption:
          'relative z-[101] flex min-h-8 min-w-0 items-center justify-center px-1',
        caption_label: cn(
          'text-body-md font-medium text-text-body',
          'inline-flex items-center gap-0.5 pointer-events-none whitespace-nowrap',
        ),
        nav: 'flex items-center gap-1',
        button_previous: cn(
          'inline-flex shrink-0 items-center justify-center size-8 rounded-md',
          'hover:bg-neutral-400 transition-colors',
        ),
        button_next: cn(
          'inline-flex shrink-0 items-center justify-center size-8 rounded-md',
          'hover:bg-neutral-400 transition-colors',
        ),
        month_grid: cn(
          'w-full max-w-full border-collapse',
          isMultiMonth ? '' : 'col-span-3 row-start-2',
        ),
        weekdays: 'table-row',
        weekday: cn(
          'w-8 text-center text-body-sm font-medium text-text-subheading tracking-body-sm',
          'py-1.5',
        ),
        week: 'table-row',
        day: 'relative p-0 text-center',
        day_button: cn(
          'inline-flex items-center justify-center size-8 rounded-md',
          'text-body-sm font-medium text-text-body tracking-body-sm',
          'hover:bg-neutral-400 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focused'
        ),
        // Hard 50%/50% split on the start/end cells so the colored half
        // of the bar ends exactly under the selected button's centerline
        // instead of fading softly past the button's right edge. Combined
        // with `outside:bg-transparent!` below this cleans up the
        // "range bar continuing past the selected day / past the last
        // day of the month" overflow.
        range_start: 'rounded-none bg-gradient-to-r from-transparent from-50% to-primary-200 to-50% shadow-[inset_0_-2px_0_white]',
        range_end: 'rounded-none bg-gradient-to-l from-transparent from-50% to-primary-200 to-50% shadow-[inset_0_-2px_0_white]',
        range_middle:
          'bg-primary-200 rounded-none [&:first-child]:rounded-l-md [&:last-child]:rounded-r-md [.rdp-day-outside+&]:rounded-l-md [&:has(+.rdp-day-outside)]:rounded-r-md shadow-[inset_0_-2px_0_white] [&>button]:bg-transparent! [&>button]:text-text-body! [&>button]:hover:bg-neutral-400',
        today: 'bg-neutral-400 rounded-md',
        // `bg-transparent!` (with !important) suppresses any range_middle
        // bg that would otherwise paint through outside-month cells —
        // that's what caused the bar to keep going past May 31 into the
        // greyed June 1-6 cells and vice versa. The neighbouring real-
        // month cell's `:has(+.rdp-day-outside)` / `.rdp-day-outside+&`
        // rules already round its edge cleanly once the outside cell
        // stops contributing background.
        outside: 'rdp-day-outside text-text-disabled bg-transparent!',
        disabled: 'text-text-disabled opacity-50',
        hidden: 'invisible',
        // The selected button is bumped to size-9 (36px) and rendered as
        // a positioned overlay so it visually masks any range-bar pixels
        // poking out past the cell's nominal 32px button slot. The cell
        // stays `relative` (from `day`) and gets `z-10` so the overlay
        // floats above the range_middle bar of the next column when the
        // cells get squeezed by `w-full` table layout.
        selected: cn(
          'relative z-10',
          '[&>button]:bg-primary',
          '[&>button]:text-white',
          '[&>button]:hover:bg-primary',
          '[&>button]:rounded-md',
          '[&>button]:size-9',
        ),
        dropdowns: 'flex items-center justify-center gap-1.5',
        dropdown_root: 'relative inline-flex items-center',
        dropdown: 'hidden',
        dropdown_month: '',
        dropdown_year: '',

        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevClassName, size }) => {
          const px =
            typeof size === 'number' && size >= 16 ? size : 20;
          const iconClass = cn('shrink-0 text-text-body', chevClassName);
          if (orientation === 'left') return <ChevronLeft size={px} className={iconClass} />;
          if (orientation === 'right') return <ChevronRight size={px} className={iconClass} />;
          if (orientation === 'down') return <ChevronDown size={px} className={iconClass} />;
          if (orientation === 'up') return <ChevronUp size={px} className={iconClass} />;
          return <ChevronRight size={px} className={iconClass} />;
        },
        Dropdown: (dropdownProps) => (
          <CalendarDropdown
            value={dropdownProps.value as string[] | number[] | string | number | undefined}
            onChange={dropdownProps.onChange}
            options={dropdownProps.options?.map((opt) => ({
              value: opt.value,
              label: opt.label,
              disabled: opt.disabled,
            }))}
            className={dropdownProps.className}
          />
        ),
        ...components,
      }}
      formatters={{
        formatMonthDropdown: (month, dateLib) =>
          dateLib ? dateLib.format(month, 'MMM') : month.toLocaleString(undefined, { month: 'short' }),
        ...formatters,
      }}
      fromYear={1900}
      toYear={2030}
      {...props}
    />
  );
}

Calendar.displayName = 'Calendar';

export { Calendar };
