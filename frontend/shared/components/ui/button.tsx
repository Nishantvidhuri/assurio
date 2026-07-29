'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

/**
 * RDS Button variants — Figma node 3007:5730.
 *
 * Figma props:
 *   type  → Primary | Secondary | Link
 *   state → Default | On Hover | Focused | Pressed | Disabled
 *   leftIcon, rightIcon, showButtonText, buttonText
 *
 * Token mapping (from Figma):
 *   Primary Default   → bg: surface/btn-primary (#0e204a), text: white
 *   Primary Hover     → bg: surface/btn-primary-hover (#0d2964)
 *   Primary Pressed   → bg: accent-800 (#08132c)
 *   Primary Focused   → bg: surface/btn-primary + ring: border-focused (#174ab5)
 *   Primary Disabled  → bg: surface-disabled (#eeeff0), text: text-disabled (#a5acb6)
 *
 *   Secondary Default → bg: surface-btn-secondary (white), border: border-hover (#e2e8f0)
 *   Secondary Hover   → bg: neutral-200 (#f9fbff), border: border-hover
 *   Secondary Pressed → bg: primary-200 (#e8edf8), border: border-hover
 *   Secondary Focused → bg: surface-btn-secondary, border: primary-800 (#103581)
 *   Secondary Disabled→ bg: white, border: border-disabled (#f3f4f7)
 *
 *   Link Default      → text: text-link (#174ab5), no bg/border/padding
 *   Link Hover        → text: accent-700 (#0b1838), underline
 *   Link Disabled     → text: text-disabled
 *
 * Dimensions: min-h 36px, px 12px (spacing/l), py 8px (spacing/m),
 *             rounded-md (8px), gap 4px (spacing/s)
 * Font: Manrope Medium, 14px/20px, tracking 0
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1 text-body-md font-medium leading-[20px] tracking-body-md whitespace-nowrap transition-colors duration-150 focus-visible:outline-none disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: [
          'h-9 px-3 py-2 rounded-md',
          'bg-surface-btn-primary text-white',
          'hover:bg-surface-btn-primary-hover',
          'active:bg-accent-800',
          'focus-visible:ring-2 focus-visible:ring-border-focused focus-visible:ring-offset-2',
          'disabled:bg-surface-disabled disabled:text-text-disabled',
        ],
        secondary: [
          'h-9 px-3 py-2 rounded-md',
          'bg-surface-btn-secondary text-text-body border border-border-hover',
          'hover:bg-neutral-200',
          'active:bg-neutral-200',
          'focus-visible:border-primary-800 focus-visible:ring-2 focus-visible:ring-primary-800 focus-visible:ring-offset-1',
          'disabled:bg-white disabled:border-border-disabled disabled:text-text-disabled',
        ],
        link: [
          'p-0',
          'text-text-link!',
          'hover:text-accent-700! hover:underline hover:decoration-[6%]',
          'active:text-accent-700! active:underline',
          'disabled:text-text-disabled! disabled:no-underline!',
        ],
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Optional icon rendered before the label */
  leftIcon?: ReactNode;
  /** Optional icon rendered after the label */
  rightIcon?: ReactNode;
  /** Show a loading spinner and disable the button */
  isLoading?: boolean;
}

/**
 * RDS Button — Figma node 3007:5730.
 *
 * @example
 * ```tsx
 * <Button variant="primary">Submit</Button>
 * <Button variant="secondary">Cancel</Button>
 * <Button variant="link">Learn more</Button>
 * <Button variant="primary" leftIcon={<ArrowLeft className="size-4" />}>Back</Button>
 * <Button variant="primary" isLoading>Saving…</Button>
 * ```
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, leftIcon, rightIcon, isLoading, disabled, type, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        // Default to "button" so a Button placed anywhere inside an ancestor
        // <form> (e.g. a layout-level search form) doesn't submit that form
        // and reload the page. Callers that actually want form submission
        // pass type="submit" explicitly (see credential-flow-form.tsx).
        type={type ?? 'button'}
        className={cn('text-body-md!',buttonVariants({ variant, className }))}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <svg
            className="size-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { Button, buttonVariants };
