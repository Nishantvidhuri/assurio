import { cn } from '@/shared/lib/utils';

export interface DividerProps {
  /** Horizontal (default) or Vertical orientation — Figma orientation prop */
  orientation?: 'Horizontal' | 'Vertical';
  /** Low = neutral-400 (#eeeff0), High = accent-300 (#b4bac7) — Figma emphasis prop */
  emphasis?: 'Low' | 'High';
  className?: string;
}

/**
 * RDS Divider — Figma node 3033:536.
 *
 * Figma props: orientation (Horizontal|Vertical), emphasis (Low|High)
 *
 * Token mapping:
 *   Low emphasis  → bg: neutral-400 (#eeeff0), 1px
 *   High emphasis → bg: accent-300 (#b4bac7), 1px
 *
 * @example
 * ```tsx
 * <Divider />
 * <Divider emphasis="High" />
 * <Divider orientation="Vertical" className="h-6" />
 * ```
 */
export function Divider({
  orientation = 'Horizontal',
  emphasis = 'Low',
  className,
}: DividerProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation === 'Horizontal' ? 'horizontal' : 'vertical'}
      className={cn(
        'shrink-0',
        emphasis === 'High' ? 'bg-accent-300' : 'bg-neutral-400',
        orientation === 'Horizontal' ? 'h-px w-full' : 'w-px h-full',
        className,
      )}
    />
  );
}
