import { cn } from '@/shared/lib/utils';

/** Total angular gap (deg). Smaller = longer arc. Split across 0°/360° — both rays transparent (no seam). */
const GAP_DEG = 28;
const GAP_HALF = GAP_DEG / 2;

function defaultStrokeWidth(sizePx: number): number {
  return Math.max(2, Math.round(sizePx * 0.08));
}

export interface LoaderProps {
  /** Ring diameter in pixels (e.g. `16`, `20`, `36`). */
  size?: number;
  /** Ring thickness in pixels; defaults to a proportion of `size`. */
  strokeWidth?: number;
  /**
   * Tailwind text color class — sets `currentColor` for the ring (e.g. `text-primary`, `text-icon-muted`).
   */
  color?: string;
  /** Optional description text displayed below the loader. */
  description?: string;
  className?: string;
  'aria-label'?: string;
}

/**
 * RDS indeterminate loader — conic ring (linear fade start → end), radial mask, round cap at arc head.
 *
 * - Horizontally centered
 * - Loader displayed on top
 * - Description displayed below the loader
 *
 * @example
 * ```tsx
 * <Loader description="Loading data..." />
 * <Loader size={36} />
 * <Loader size={72} strokeWidth={5} description="Please wait" />
 * ```
 */
export function Loader({
  size = 36,
  strokeWidth,
  color = 'text-primary',
  description,
  className,
  'aria-label': ariaLabel = 'Loading',
}: LoaderProps) {
  const stroke = strokeWidth ?? defaultStrokeWidth(size);
  const ringMask = `radial-gradient(farthest-side, transparent calc(100% - ${stroke}px), #000 calc(100% - ${stroke}px))`;

  const arcStart = GAP_HALF;
  const arcEnd = 360 - GAP_HALF;

  const background = [
    'conic-gradient(',
    'transparent 0deg,',
    `transparent ${arcStart}deg,`,
    `currentColor ${arcStart}deg,`,
    `transparent ${arcEnd}deg,`,
    'transparent 360deg',
    ')',
  ].join(' ');

  const rMid = size / 2 - stroke / 2;
  const thetaRad = (arcStart * Math.PI) / 180;
  const cap = Math.max(stroke, 2);
  const capLeft = size / 2 + rMid * Math.sin(thetaRad) - cap / 2;
  const capTop = size / 2 - rMid * Math.cos(thetaRad) - cap / 2;

  return (
    <div className={cn('w-full flex justify-center', className)}>
      <span
        role="status"
        aria-label={ariaLabel}
        className="flex flex-col items-center gap-3"
      >
        {/* Loader */}
        <span
          className={cn('relative block shrink-0 animate-spin rounded-full', color)}
          style={{
            width: size,
            height: size,
            animationDuration: '1.2s',
            animationDirection: 'reverse',
          }}
        >
          <span
            className="pointer-events-none absolute inset-0 block rounded-full"
            style={{
              background,
              WebkitMask: ringMask,
              mask: ringMask,
            }}
          />
          <span
            className="pointer-events-none absolute rounded-full bg-current"
            style={{
              width: cap,
              height: cap,
              left: capLeft,
              top: capTop,
              zIndex: 1,
            }}
          />
        </span>

        {/* Description */}
        {description && (
          <span className="text-sm text-center text-current">
            {description}
          </span>
        )}
      </span>
    </div>
  );
}
