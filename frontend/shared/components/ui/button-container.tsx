import { type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

/**
 * RDS Button Container — Figma node 3217:5338.
 *
 * A layout wrapper that positions 1–3 buttons with consistent
 * spacing and optional top border + padding.
 *
 * Figma props:
 *   alignment     → Right | Left | Center
 *   buttonCount   → 1 | 2 | 3  (informational, actual count comes from children)
 *   configuration → With Padding | Without Padding
 *
 * Token mapping:
 *   With Padding    → border-top: 1px neutral-400 (#eeeff0),
 *                      px: 20px (spacing/2xl), py: 12px (spacing/l)
 *   Without Padding → no border, no padding
 *   Gap             → 12px (spacing/l)
 *   Background      → white
 */
const buttonContainerVariants = cva(
  'flex items-center bg-white w-full',
  {
    variants: {
      alignment: {
        Right: 'justify-end',
        Left: 'justify-start',
        Center: 'justify-center',
      },
      configuration: {
        'With Padding': 'border-t border-neutral-400 px-5 py-3',
        'Without Padding': '',
      },
    },
    defaultVariants: {
      alignment: 'Right',
      configuration: 'With Padding',
    },
  },
);

export interface ButtonContainerProps
  extends VariantProps<typeof buttonContainerVariants> {
  children: ReactNode;
  className?: string;
}

/**
 * RDS ButtonContainer — Figma node 3217:5338.
 *
 * @example
 * ```tsx
 * // Single primary button, right-aligned with top border
 * <ButtonContainer alignment="Right" configuration="With Padding">
 *   <Button variant="primary">Save</Button>
 * </ButtonContainer>
 *
 * // Two buttons, right-aligned: secondary first, then primary
 * <ButtonContainer alignment="Right" configuration="With Padding">
 *   <Button variant="secondary">Cancel</Button>
 *   <Button variant="primary">Submit</Button>
 * </ButtonContainer>
 *
 * // Three buttons, left-aligned, no padding
 * <ButtonContainer alignment="Left" configuration="Without Padding">
 *   <Button variant="primary">Primary</Button>
 *   <Button variant="secondary">Secondary</Button>
 *   <Button variant="secondary">Secondary</Button>
 * </ButtonContainer>
 * ```
 */
export function ButtonContainer({
  children,
  alignment,
  configuration,
  className,
}: ButtonContainerProps) {
  return (
    <div
      className={cn(
        buttonContainerVariants({ alignment, configuration }),
        'gap-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

export { buttonContainerVariants };
