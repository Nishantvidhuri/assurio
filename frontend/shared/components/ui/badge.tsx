import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

/**
 * Badge variants mapped 1:1 from Figma node 3106:196.
 *
 * Figma props:
 *   size → Small | Large
 *   type → Primary | Default | Warning | Success | Failure
 *
 * Small badges render as colored dots (no label).
 * Large badges render as pill-shaped labels with text.
 *
 * Figma token mapping:
 *   Primary  → bg: surface/primary-info (#174ab5), text: white
 *   Default  → bg: neutral/400 (#eeeff0), text: text/body (#374150)
 *   Success  → bg: success/default (#2fab5d), text: white
 *   Warning  → bg: warning/default (#ffb522), text: white
 *   Failure  → bg: failure/default (#e33939), text: white
 */
const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full',
  {
    variants: {
      type: {
        Primary: 'bg-surface-primary',
        Default: 'bg-neutral-400',
        Success: 'bg-success',
        Warning: 'bg-warning',
        Failure: 'bg-failure',
      },
      size: {
        Small: 'size-2',
        Large: 'h-5 min-w-5 px-[6.5px] py-0',
      },
    },
    defaultVariants: {
      type: 'Primary',
      size: 'Small',
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Text displayed inside a Large badge. Ignored for Small badges. */
  label?: string;
}

/**
 * RDS Badge component — Figma node 3106:196.
 *
 * @example
 * ```tsx
 * <Badge type="Primary" size="Small" />
 * <Badge type="Success" size="Large" label="5" />
 * <Badge type="Failure" size="Large" label="!" />
 * <Badge type="Default" size="Large" label="12" />
 * ```
 */
export function Badge({ className, type, size, label = '3', ...props }: BadgeProps) {
  const isLarge = size === 'Large';
  const isDefault = type === 'Default';

  return (
    <span className={cn(badgeVariants({ type, size, className }))} {...props}>
      {size === 'Small' && <span className="block size-0.5" />}
      {isLarge && (
        <span
          className={cn(
            'text-body-sm font-medium leading-[20px] tracking-body-sm text-center whitespace-nowrap',
            isDefault ? 'text-text-body' : 'text-white',
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}

export { badgeVariants };
