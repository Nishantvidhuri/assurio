'use client';

import { type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

/**
 * RDS Tag/Chip — Figma node 3033:1665
 */
const tagVariants = cva(
  'inline-flex items-center justify-center gap-1 rounded-full px-2 py-px',
  {
    variants: {
      variant: {
        Default: 'bg-surface-disabled text-text-body',
        Primary: 'bg-surface-primary text-white',
        Warning: 'bg-surface-warning text-warning',
        Success: 'bg-surface-success text-caption text-success',
        Info: 'bg-primary-200 text-primary',
        Failure: 'bg-surface-error text-failure',
      },
    },
    defaultVariants: {
      variant: 'Default',
    },
  },
);

export interface TagProps extends VariantProps<typeof tagVariants> {
  label: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
}

export function Tag({
  variant,
  label,
  leftIcon,
  rightIcon,
  className,
}: TagProps) {
  const iconClass =
    variant === 'Primary'
      ? 'text-white'
      : variant === 'Warning'
        ? 'text-warning'
        : variant === 'Success'
          ? 'text-success'
          : variant === 'Info'
            ? 'text-primary'
            : variant === 'Failure'
              ? 'text-failure'
              : 'text-text-body';

  return (
    <span className={cn(tagVariants({ variant }), className)}>
      {leftIcon ? (
        <span className={cn('inline-flex size-4 items-center justify-center [&>svg]:size-4', iconClass)}>
          {leftIcon}
        </span>
      ) : null}
      <span className="text-body-sm font-medium leading-[20px] tracking-body-sm">
        {label}
      </span>
      {rightIcon ? (
        <span className={cn('inline-flex size-4 items-center justify-center [&>svg]:size-4', iconClass)}>
          {rightIcon}
        </span>
      ) : null}
    </span>
  );
}

export { tagVariants };
