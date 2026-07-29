'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Visual size — matches Figma size prop */
  size?: 'Small' | 'Medium';
  /** Label text shown beside the checkbox */
  label?: string;
  /** Show the label (Figma: showLabel) */
  showLabel?: boolean;
  /** Indeterminate / mixed state (dash icon instead of check) */
  indeterminate?: boolean;
  /** Disable hover ring/border visuals while keeping the base control shape */
  disableHoverEffect?: boolean;
  /** Render as a decorative visual only: no pointer cursor and no keyboard focus */
  nonInteractive?: boolean;
  /** Extra classes for the label text — e.g. pass `whitespace-normal` to allow long labels to wrap. */
  labelClassName?: string;
  /**
   * Override the checked-state colour. Pass both bg and border in
   * one string, e.g. `"bg-success border-success"`. Useful for
   * legend-style checkbox lists where each row's check colour mirrors
   * a status swatch. Disabled rows still fall back to the neutral
   * grey treatment regardless of this prop.
   *
   * Default: `"bg-primary border-primary"` (RDS primary blue).
   */
  checkedColorClass?: string;
}

/**
 * RDS Checkbox — Figma node 3112:1979.
 *
 * Figma props: size (Small|Medium), state (Default|On Hover|Disabled),
 * type (Unselected|Selected|Indeterminate), showLabel, labelText
 *
 * Token mapping:
 *   Unselected box  → border: neutral-500 (#e2e8f0), bg: white
 *   Selected box    → bg: primary (#174ab5), border: primary
 *   Indeterminate   → bg: primary (#174ab5), border: primary, dash icon
 *   Disabled        → opacity-50, cursor-not-allowed
 *   Hover ring      → bg-primary-200 rounded-full (Figma hover circle)
 *   Small box       → 16×16, Medium box → 20×20
 *   Checkmark/dash  → white, lucide-react icons
 *   Label font      → text-body-md font-medium text-text-body, gap-2 (8px = spacing/m)
 *
 * @example
 * ```tsx
 * <Checkbox label="Accept terms" />
 * <Checkbox size="Small" checked indeterminate />
 * <Checkbox size="Medium" disabled label="Locked" showLabel />
 * ```
 */
const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      className,
      size = 'Medium',
      label,
      showLabel = true,
      indeterminate = false,
      disableHoverEffect = false,
      nonInteractive = false,
      labelClassName,
      checkedColorClass = 'bg-primary border-primary',
      checked,
      disabled,
      ...props
    },
    ref,
  ) => {
    const boxSize = size === 'Small' ? 'size-4' : 'size-5';
    const iconSize = size === 'Small' ? 'size-3' : 'size-3.5';
    const isChecked = checked || indeterminate;
    const isControlled = typeof checked !== 'undefined';
    const isReadOnlyControlled = isControlled && !props.onChange;

    return (
      <label
        className={cn(
          'inline-flex items-center gap-2 group',
          nonInteractive
            ? 'cursor-default pointer-events-none'
            : disabled
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer',
          className,
        )}
      >
        <span className="relative inline-flex items-center justify-center">
          {/* Hover ring */}
          <span
            className={cn(
              'absolute rounded-full transition-colors',
              size === 'Small' ? 'size-6' : 'size-8',
              !disabled && !disableHoverEffect && 'group-hover:bg-primary-200',
            )}
          />

          {/* Visual box. Disabled-checked uses neutral grey instead of the
              primary blue so it reads as inactive (matches RDS disabled
              state — required for "mandatory column" rows in customizer
              menus and read-only forms). */}
          <span
            className={cn(
              'relative inline-flex items-center justify-center rounded-sm border-2 transition-colors',
              isChecked
                ? disabled
                  ? cn(boxSize, 'bg-neutral-400 border-neutral-400')
                  : cn(boxSize, checkedColorClass)
                : cn(boxSize, 'bg-white border-accent-300', !disableHoverEffect ? 'border-accent-300' : 'border-surface-disabled' ),
            )}
          >
            {checked && !indeterminate && (
              <Check className={cn(iconSize, 'absolute text-white animate-[stepCheckPop_400ms_ease-out]')} strokeWidth={3} />
            )}
            {indeterminate && (
              <Minus className={cn(iconSize, 'absolute text-white animate-[stepCheckPop_400ms_ease-out]')} strokeWidth={3} />
            )}
          </span>

          {/* Hidden native input for form semantics */}
          <input
            ref={ref}
            type="checkbox"
            checked={checked}
            readOnly={props.readOnly ?? isReadOnlyControlled}
            disabled={disabled}
            className="sr-only"
            tabIndex={nonInteractive ? -1 : props.tabIndex}
            aria-hidden={nonInteractive || props['aria-hidden']}
            {...props}
          />
        </span>

        {showLabel && label && (
          <span
            className={cn(
              'text-body-md font-medium leading-[20px] tracking-body-md text-text-body whitespace-nowrap',
              labelClassName,
            )}
          >
            {label}
          </span>
        )}
      </label>
    );
  },
);

Checkbox.displayName = 'Checkbox';

export { Checkbox };
