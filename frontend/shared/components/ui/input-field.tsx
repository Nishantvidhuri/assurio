'use client';

import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
  type HTMLAttributes,
  type WheelEventHandler,
} from 'react';
import { cva } from 'class-variance-authority';
import { CircleAlert } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════════
 * InputFieldWrapper — shared label / error / note / counter frame
 *
 * Figma nodes 3158:539 & 3172:2444 — the outer chrome that surrounds
 * every input variant (text, textarea, phone, dropdown, date).
 *
 * Token mapping:
 *   gap between label ↔ input ↔ bottom: gap-1 (4px = spacing/s)
 *   Label: text-body-sm (12px), font-semibold, text-text-body, tracking-body-sm
 *   Asterisk: text-text-error (#e33939)
 *   Optional: text-text-subheading (#828d9d), font-medium
 *   Error msg: text-text-error, text-body-sm, font-medium, tracking-body-sm
 *   Counter: text-text-disabled (#a5acb6), text-body-sm, font-medium, text-right
 *   Note: text-text-body, text-body-sm, font-medium
 * ═══════════════════════════════════════════════════════════════════════ */

export interface InputFieldWrapperProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  note?: string;
  counter?: string;
  disabled?: boolean;
  children: ReactNode;
}

const InputFieldWrapper = forwardRef<HTMLDivElement, InputFieldWrapperProps>(
  (
    {
      className,
      label,
      required,
      optional,
      error,
      note,
      counter,
      disabled = false,
      children,
      ...props
    },
    ref,
  ) => {
    const labelColor = disabled ? 'text-text-disabled' : 'text-text-body';
    const optionalColor = disabled
      ? 'text-text-disabled'
      : 'text-text-subheading';
    return (
      <div ref={ref} className={cn('flex flex-col gap-1 w-full', className)} {...props}>
        {/* Label row */}
        {label && (
          <div className="flex items-baseline gap-1 whitespace-nowrap">
            <span
              className={cn(
                'text-xs font-semibold leading-[20px] tracking-body-sm',
                labelColor,
              )}
            >
              {label}
            </span>
            {required && (
              <span className="text-xs font-medium leading-[20px] tracking-body-sm text-text-error">
                *
              </span>
            )}
            {optional && (
              <span
                className={cn(
                  'text-xs font-medium leading-[20px] tracking-body-sm',
                  optionalColor,
                )}
              >
                (Optional)
              </span>
            )}
          </div>
        )}

        {/* Input slot */}
        {children}

        {/* Bottom row: error / note / counter */}
        {(error || note || counter) && (
          <div className="flex items-start justify-between w-full">
            {error ? (
              <span className="text-body-sm font-medium leading-[20px] tracking-body-sm text-text-error whitespace-nowrap">
                {error}
              </span>
            ) : note ? (
              <span className="text-body-sm font-medium leading-[20px] tracking-body-sm text-text-body">
                {note}
              </span>
            ) : (
              <span />
            )}
            {counter && (
              <span className="flex-1 text-body-sm font-medium leading-[20px] tracking-body-sm text-text-disabled text-right">
                {counter}
              </span>
            )}
          </div>
        )}
      </div>
    );
  },
);

InputFieldWrapper.displayName = 'InputFieldWrapper';

/* ═══════════════════════════════════════════════════════════════════════════
 * Input box visual chrome — the bordered box around the native input
 *
 * Border states from Figma:
 *   Default  → border-default (#eeeff0)
 *   Hover    → border-hover (#e2e8f0)
 *   Focused  → border-focused (#174ab5)
 *   Error    → border-failure (#e33939)
 *   Disabled → border-disabled (#f3f4f7)
 *   ReadOnly → bg: neutral-300, border: border-default
 *
 * Padding: px-3 (12px = spacing/l), py-2 (8px = spacing/m)
 * rounded-md, gap-3 (12px = spacing/l) between icon and text
 * ═══════════════════════════════════════════════════════════════════════ */

const inputBoxVariants = cva(
  [
    'flex items-center gap-3 w-full rounded-md border bg-white transition-colors duration-150',
    'px-3 py-2',
  ],
  {
    variants: {
      state: {
        default: 'border-border-default hover:border-border-hover focus-within:border-border-focused!',
        error: 'border-border-failure',
        disabled: 'border-border-disabled cursor-not-allowed',
        readonly: 'bg-neutral-300 border-border-default cursor-not-allowed',
      },
    },
    defaultVariants: {
      state: 'default',
    },
  },
);

/* ═══════════════════════════════════════════════════════════════════════════
 * Input — single-line text input — Figma node 3158:539 (type = "Text box")
 *
 * Typography: text-body-md (14px), font-normal, leading-[20px], tracking-body-md
 * Placeholder: text-text-disabled (#a5acb6)
 * Filled: text-text-body (#374150)
 * Error icon: CircleAlert, 16px, right side
 * ═══════════════════════════════════════════════════════════════════════ */

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  error?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, leftIcon, rightIcon, error, disabled, readOnly, onWheel, type, ...props }, ref) => {
    const state = error
      ? 'error'
      : disabled
        ? 'disabled'
        : readOnly
          ? 'readonly'
          : 'default';
    const handleWheel: WheelEventHandler<HTMLInputElement> = (event) => {
      onWheel?.(event);
      if (event.defaultPrevented) return;
      if (type === 'number' && document.activeElement === event.currentTarget) {
        event.currentTarget.blur();
      }
    };

    return (
      <div
        className={cn(
          inputBoxVariants({ state }),
          // focus-within handled in inputBoxVariants default state
          className,
        )}
      >
        {leftIcon ? (
          <span className="inline-flex shrink-0 items-center justify-center text-icon-muted [&>svg]:size-4">
            {leftIcon}
          </span>
        ) : null}

        <input
          ref={ref}
          disabled={disabled}
          readOnly={readOnly}
          type={type}
          onWheel={handleWheel}
          className={cn(
            'flex-1 min-w-0 bg-transparent outline-none',
            // 16px on mobile/tablet so iOS Safari doesn't auto-zoom the
            // page when the field is focused; 14px (text-sm) on desktop.
            'text-base lg:text-sm font-normal leading-[20px] tracking-body-md',
            'text-text-body placeholder:text-base lg:placeholder:text-sm placeholder:text-text-disabled',
            disabled && 'cursor-not-allowed',
            readOnly && 'text-text-subheading cursor-not-allowed',
          )}
          {...props}
        />

        {error && <CircleAlert className="shrink-0 size-4 text-text-error" />}
        {!error && rightIcon ? (
          <span className="inline-flex shrink-0 items-center justify-center text-icon-muted [&>svg]:size-4">
            {rightIcon}
          </span>
        ) : null}
      </div>
    );
  },
);

Input.displayName = 'Input';

/* ═══════════════════════════════════════════════════════════════════════════
 * Textarea — multiline input — Figma node 3158:539 (type = "Description")
 *
 * Same chrome as Input but uses <textarea>, min-h for multiline,
 * native resize handle (Figma shows it).
 * ═══════════════════════════════════════════════════════════════════════ */

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, disabled, readOnly, ...props }, ref) => {
    const state = error
      ? 'error'
      : disabled
        ? 'disabled'
        : readOnly
          ? 'readonly'
          : 'default';

    return (
      <div
        className={cn(
          inputBoxVariants({ state }),
          'items-start',
          // focus-within handled in inputBoxVariants default state
        )}
      >
        <textarea
          ref={ref}
          disabled={disabled}
          readOnly={readOnly}
          className={cn(
            'flex-1 min-w-0 min-h-[80px] bg-transparent outline-none resize-y',
            // 16px on mobile/tablet so iOS Safari doesn't auto-zoom the
            // page when the field is focused; 14px (text-sm) on desktop.
            'text-base lg:text-sm font-normal leading-[20px] tracking-body-md',
            'text-text-body placeholder:text-base lg:placeholder:text-sm placeholder:text-text-disabled',
            disabled && 'cursor-not-allowed',
            readOnly && 'text-text-subheading cursor-not-allowed',
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';

export { InputFieldWrapper, Input, Textarea, inputBoxVariants };
