'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/utils';

export interface SwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Whether the switch is on (Figma: status = true) */
  checked?: boolean;
}

/**
 * RDS Switch — Figma node 3033:292.
 *
 * Figma props: state (boolean — enabled/disabled control), status (boolean — on/off)
 *
 * Token mapping:
 *   ON + enabled   → track: primary (#174ab5), thumb: white + shadow
 *   ON + disabled  → track: primary-300 (#94acdd), thumb: neutral-200 (#f9fbff)
 *   OFF + enabled  → track: neutral-500 (#e2e8f0), thumb: white + shadow
 *   OFF + disabled → track: neutral-400 (#eeeff0), thumb: accent-200 (#dbdee4)
 *
 * Dimensions: track 32×16, thumb 12×12, rounded-[9px], thumb inset 2px
 * Shadow (enabled thumb): 0px 0.8px 6px rgba(11,26,59,0.05)
 *
 * @example
 * ```tsx
 * <Switch checked onChange={handleChange} />
 * <Switch disabled />
 * ```
 */
const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked = false, disabled = false, ...props }, ref) => {
    const isOn = checked;

    return (
      <label
        className={cn(
          'inline-flex items-center',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          className,
        )}
      >
        <input
          ref={ref}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          className="sr-only"
          {...props}
        />

        {/* Track */}
        <span
          className={cn(
            'relative h-4 w-8 rounded-[9px] transition-colors duration-300 ease-in-out',
            isOn
              ? disabled
                ? 'bg-primary-300'
                : 'bg-primary'
              : disabled
                ? 'bg-neutral-400'
                : 'bg-neutral-500',
          )}
        >
          {/* Thumb */}
          <span
            className={cn(
              'absolute left-0.5 top-1/2 -translate-y-1/2 size-3 rounded-full transition-transform duration-300 ease-in-out',
              isOn ? 'translate-x-4' : 'translate-x-0',
              isOn
                ? disabled
                  ? 'bg-neutral-200'
                  : 'bg-white shadow-[0px_0.8px_6px_0px_rgba(11,26,59,0.05)]'
                : disabled
                  ? 'bg-accent-200'
                  : 'bg-white shadow-[0px_0.8px_6px_0px_rgba(11,26,59,0.05)]',
            )}
          />
        </span>
      </label>
    );
  },
);

Switch.displayName = 'Switch';

export { Switch };
