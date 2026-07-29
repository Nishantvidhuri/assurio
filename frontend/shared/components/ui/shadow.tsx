'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * RDS Shadow scale — Figma node 3249:209
 *
 * Levels:
 * - 50  -> 0px 0.8px 6px 0px rgba(11,26,59,0.05)
 * - 100 -> 0px 1px 5px 0px rgba(11,26,59,0.06)
 * - 200 -> 0px 3px 10px 0px rgba(11,26,59,0.06)
 * - 300 -> 0px 2px 7px 0px rgba(11,26,59,0.09)
 * - 400 -> 0px 3px 12px 0px rgba(11,26,59,0.10)
 * - 500 -> 0px 2px 11px 0px rgba(11,26,59,0.12)
 * - 600 -> 0px 3px 20px 0px rgba(11,26,59,0.08)
 * - 700 -> 0px 2px 11px 0px rgba(11,26,59,0.12)
 */

export const shadowVariants = cva('', {
  variants: {
    level: {
      '50': 'shadow-[0px_0.8px_6px_0px_rgba(11,26,59,0.05)]',
      '100': 'shadow-[0px_1px_5px_0px_rgba(11,26,59,0.06)]',
      '200': 'shadow-[0px_3px_10px_0px_rgba(11,26,59,0.06)]',
      '300': 'shadow-[0px_2px_7px_0px_rgba(11,26,59,0.09)]',
      '400': 'shadow-[0px_3px_12px_0px_rgba(11,26,59,0.10)]',
      '500': 'shadow-[0px_2px_11px_0px_rgba(11,26,59,0.12)]',
      '600': 'shadow-[0px_3px_20px_0px_rgba(11,26,59,0.08)]',
      '700': 'shadow-[0px_2px_11px_0px_rgba(11,26,59,0.12)]',
      none: 'shadow-none',
    },
  },
  defaultVariants: {
    level: '100',
  },
});

export type ShadowLevel = Exclude<NonNullable<VariantProps<typeof shadowVariants>['level']>, null>;

export function getShadowClassName(level: ShadowLevel = '100') {
  return shadowVariants({ level });
}

export interface ShadowProps extends HTMLAttributes<HTMLDivElement> {
  level?: ShadowLevel;
}

/**
 * Convenience wrapper for applying RDS shadow levels to a container.
 */
export function Shadow({ level = '100', className, ...props }: ShadowProps) {
  return <div className={cn(shadowVariants({ level }), className)} {...props} />;
}
