'use client';

import { forwardRef, useState, type HTMLAttributes } from 'react';
import { format } from 'date-fns';

import { cn } from '@/shared/lib/utils';
import { Calendar } from '@/shared/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover';
import { SvgIcon } from './svg-icon';
import calendarIcon from '@/public/assets/icons/calendar/Calendar=16px.svg'

/**
 * RDS DateInput — Figma node 3172:2444 (type = "Date").
 *
 * Token mapping:
 *   Input box: h-9, px-3 (12px = spacing/l), py-2 (8px = spacing/m),
 *              rounded-md, border 1px
 *   Text: text-body-md, font-normal, leading-[20px], tracking-body-md
 *   Placeholder: text-text-disabled
 *   Filled: text-text-body
 *   Calendar icon: 16px, right side, text-icon-muted
 *   Border states: same as InputField
 *   Calendar popover: shadow-200, rounded-md, border neutral-500
 *   Date format: DD/MM/YYYY (from Figma: "15/02/2026")
 *
 * @example
 * ```tsx
 * <DateInput value={date} onChange={setDate} placeholder="Select date" />
 * <DateInput value={date} onChange={setDate} disabled />
 * ```
 */

export interface DateInputProps extends Omit<HTMLAttributes<HTMLButtonElement>, 'onChange'> {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  dateFormat?: string;
  disabled?: boolean;
  readOnly?: boolean;
  error?: boolean;
  /** Earliest selectable day (inclusive). Days before this are greyed out and not clickable. */
  minDate?: Date;
  /** Latest selectable day (inclusive). */
  maxDate?: Date;
  /**
   * Per-day disabled matcher. Return true to make that day unclickable
   * (greyed out + cursor-not-allowed in the calendar popover). Combined
   * with minDate/maxDate via OR. Use this to mark days with no
   * available verifier slots in the Schedule Call dialog.
   */
  disabledDays?: (date: Date) => boolean;
}

const DateInput = forwardRef<HTMLButtonElement, DateInputProps>(
  (
    {
      className,
      value,
      onChange,
      placeholder = 'DD/MM/YYYY',
      dateFormat = 'dd/MM/yyyy',
      disabled = false,
      readOnly = false,
      error = false,
      minDate,
      maxDate,
      disabledDays,
      ...props
    },
    ref,
  ) => {
    // react-day-picker `disabled` matcher: an array combines multiple
    // matchers with OR semantics ("disable if any matcher matches").
    const calendarDisabled = (() => {
      const matchers: Array<
        { before: Date } | { after: Date } | ((d: Date) => boolean)
      > = [];
      if (minDate) matchers.push({ before: minDate });
      if (maxDate) matchers.push({ after: maxDate });
      if (disabledDays) matchers.push(disabledDays);
      if (matchers.length === 0) return undefined;
      return matchers.length === 1 ? matchers[0] : matchers;
    })();
    const [open, setOpen] = useState(false);

    const handleSelect = (day: Date | undefined) => {
      onChange?.(day);
      setOpen(false);
    };

    const canOpen = !disabled && !readOnly;

    return (
      <Popover open={canOpen ? open : false} onOpenChange={canOpen ? setOpen : undefined}>
        <PopoverTrigger asChild>
          <button
            ref={ref}
            type="button"
            disabled={disabled}
            tabIndex={canOpen ? 0 : -1}
            className={cn(
              'flex items-center gap-2 h-9 w-full',
              'border rounded-md px-3 py-2 bg-transparent outline-none',
              'transition-colors duration-150',
              error
                ? 'border-border-failure'
                : disabled
                  ? 'border-border-disabled bg-white cursor-not-allowed'
                  : readOnly
                    ? 'bg-neutral-300 border-border-default cursor-not-allowed'
                    : 'border-border-default hover:border-border-hover focus:border-border-focused! focus-visible:border-border-focused! cursor-pointer',
              open && !error && !disabled && !readOnly && 'border-border-focused!',
              className,
            )}
            {...props}
          >
            <span
              className={cn(
                'flex-1 text-left text-sm font-normal leading-[20px] tracking-body-md select-none',
                value ? 'text-text-body' : 'text-text-disabled',
              )}
            >
              {value ? format(value, dateFormat) : placeholder}
            </span>

            <span className='text-icon-default flex justify-center items-center'><SvgIcon src={calendarIcon} alt='calendar' /></span>

          </button>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0 border-0 shadow-none" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleSelect}
            defaultMonth={value ?? minDate}
            disabled={calendarDisabled}
          />
        </PopoverContent>
      </Popover>
    );
  },
);

DateInput.displayName = 'DateInput';

export { DateInput };
