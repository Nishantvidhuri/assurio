'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/utils';

export interface RadioButtonProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Visual size — matches Figma size prop */
  size?: 'Small' | 'Medium';
  /** Label text shown beside the radio */
  label?: string;
  /** Show the label (Figma: showLabel) */
  showLabel?: boolean;
  /** Disable hover ring/border visuals while keeping the base control shape */
  disableHoverEffect?: boolean;
  /** Render as a decorative visual only: no pointer cursor and no keyboard focus */
  nonInteractive?: boolean;
}

/**
 * RDS Radio Button — Figma node 3113:170.
 *
 * Figma props: size (Small|Medium), state (Default|On Hover|Disabled),
 * type (boolean — selected or not), showLabel, labelText
 *
 * Token mapping:
 *   Unselected ring → border: neutral-500 (#e2e8f0), bg: white
 *   Selected ring   → border: primary (#174ab5), inner dot: primary (#174ab5)
 *   Disabled        → opacity-50, cursor-not-allowed
 *   Hover ring      → bg-primary-200 rounded-full (Figma hover circle)
 *   Small           → 16×16, Medium → 20×20
 *   Label font      → text-body-md font-medium text-text-body, gap-2 (8px = spacing/m)
 *
 * @example
 * ```tsx
 * <RadioButton name="plan" value="free" label="Free" />
 * <RadioButton name="plan" value="pro" label="Pro" checked />
 * <RadioButton size="Small" disabled label="Locked" />
 * ```
 */
const RadioButton = forwardRef<HTMLInputElement, RadioButtonProps>(
  (
    {
      className,
      size = 'Medium',
      label,
      showLabel = true,
      disableHoverEffect = false,
      nonInteractive = false,
      checked,
      disabled,
      ...props
    },
    ref,
  ) => {
    const ringSize = size === 'Small' ? 'size-4' : 'size-3.5';
    const dotSize = size === 'Small' ? 'size-1.5' : 'size-[5px]';
    // A controlled `checked` with no `onChange` is a decorative/read-only
    // radio (e.g. the visual inside a clickable option card) — mark the native
    // input read-only so React doesn't warn about an unmanaged form field.
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

          {/* Visual radio circle */}
          <span
            className={cn(
              'relative inline-flex items-center justify-center rounded-full border-2 transition-colors',
              ringSize,
              checked
                ? 'border-primary bg-primary'
                : 'border-neutral-600 bg-white',
              !disabled &&
                !disableHoverEffect &&
                !checked &&
                'group-hover:border-primary-300',
            )}
          >
            {checked && (
              <span className={cn(dotSize, 'rounded-full bg-white animate-[stepCheckPop_300ms_ease-out]')} />
            )}
          </span>

          {/* Hidden native input */}
          <input
            ref={ref}
            type="radio"
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
          <span className="text-body-md font-medium leading-[20px] tracking-body-md text-text-body whitespace-nowrap">
            {label}
          </span>
        )}
      </label>
    );
  },
);

RadioButton.displayName = 'RadioButton';

export { RadioButton };
