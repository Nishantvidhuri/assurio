import { cn } from '@/shared/lib/utils';

/**
 * Background Sheen overlay.
 * Figma node: 3038:38 — Color: neutral-800 (#374150), Opacity: 20%
 *
 * A translucent overlay used as a background sheen/scrim.
 * Apply size and position via className — the component only provides
 * the color and opacity so it can be reused across varying layouts.
 *
 * @example
 * ```tsx
 * <div className="relative">
 *   <Sheen className="absolute inset-0" />
 *   <div className="relative z-10">Content above sheen</div>
 * </div>
 * ```
 */
export function Sheen({ className }: { className?: string }) {
  return (
    <div className={cn('bg-neutral-800/20', className)} />
  );
}
