'use client';

import { ChevronRight } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { Button } from '@/shared/components/ui/button';
import { getShadowClassName } from '@/shared/components/ui/shadow';
import { cn } from '@/shared/lib/utils';

/**
 * RDS Tooltip — Figma node 3224:7714
 *
 * Supports:
 * - Basic tooltip (dark, single line)
 * - Descriptive tooltip (white card with link action)
 * - 8 positions: top/bottom/left/right; bubble aligns start/center/end, caret centered on top/bottom edge
 */

const tooltipStackTopBottom = 'w-max flex-col items-stretch';

const tooltipContainerVariants = cva('inline-flex shrink-0', {
  variants: {
    position: {
      'top-left': tooltipStackTopBottom,
      'top-center': tooltipStackTopBottom,
      'top-right': tooltipStackTopBottom,
      'bottom-left': tooltipStackTopBottom,
      'bottom-center': tooltipStackTopBottom,
      'bottom-right': tooltipStackTopBottom,
      'left': 'flex-row items-center',
      'right': 'flex-row items-center',
    },
  },
  defaultVariants: {
    position: 'top-left',
  },
});

function bubbleEdgeAlignClass(position: TooltipPosition): string | undefined {
  if (position === 'left' || position === 'right') return undefined;
  if (position.endsWith('left')) return 'self-start';
  if (position.endsWith('right')) return 'self-end';
  return 'self-center';
}

const basicBubbleVariants = cva(
  'w-fit rounded-md bg-surface-tooltip px-3 py-2 text-center text-[12px] font-medium leading-[20px] tracking-body-sm text-white',
);

const descriptiveBubbleVariants = cva(
  'flex w-[300px] flex-col items-start gap-2 rounded-md bg-white p-3',
);

type TooltipPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'left'
  | 'right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

type TooltipVariant = 'basic' | 'descriptive';

/** Which side of the tooltip box the triangle sits on (border trick = tip points the opposite way, toward the anchor). */
type CaretEdge = 'top' | 'bottom' | 'left' | 'right';

function caretEdgeFromPosition(position: TooltipPosition): CaretEdge {
  if (position.startsWith('top')) return 'top';
  if (position.startsWith('bottom')) return 'bottom';
  return position === 'left' ? 'left' : 'right';
}

/** Transparent borders + one solid edge = triangle. Sizes tuned so top/bottom match side tooltips visually. */
const CARET_OUTLINE: Record<CaretEdge, string> = {
  top: 'border-x-[8px] border-x-transparent border-t-[9px]',
  bottom: 'border-x-[8px] border-x-transparent border-b-[9px]',
  left: 'border-y-[6px] border-y-transparent border-l-[8px]',
  right: 'border-y-[6px] border-y-transparent border-r-[8px]',
};

const CARET_FILL_BASIC: Record<CaretEdge, string> = {
  top: 'border-t-surface-tooltip',
  bottom: 'border-b-surface-tooltip',
  left: 'border-l-surface-tooltip',
  right: 'border-r-surface-tooltip',
};

const CARET_FILL_DESCRIPTIVE: Record<CaretEdge, string> = {
  top: 'border-t-white',
  bottom: 'border-b-white',
  left: 'border-l-white',
  right: 'border-r-white',
};

const CARET_TUCK: Record<CaretEdge, string> = {
  top: '-mt-[2px]',
  bottom: '-mb-[2px]',
  left: '-mr-[5px]',
  right: '-ml-[5px]',
};

export interface TooltipProps {
  position?: TooltipPosition;
  variant?: TooltipVariant;
  text?: string;
  description?: string;
  actionLabel?: string;
  onActionClick?: () => void;
  width?: number | string;
  className?: string;
  bubbleClassName?: string;
}

function Arrow({
  position = 'top-left',
  variant = 'basic',
}: {
  position?: TooltipPosition;
  variant?: TooltipVariant;
}) {
  const edge = caretEdgeFromPosition(position);
  const fill = variant === 'basic' ? CARET_FILL_BASIC[edge] : CARET_FILL_DESCRIPTIVE[edge];

  return (
    <span
      aria-hidden
      className={cn(
        'relative z-0 block size-0 shrink-0 border-solid',
        CARET_OUTLINE[edge],
        fill,
        CARET_TUCK[edge],
      )}
    />
  );
}

function getTooltipAnimation(position: TooltipPosition): string {
  if (position.startsWith('top')) return 'animate-[tooltipSlideUp_300ms_ease-out]';
  if (position.startsWith('bottom')) return 'animate-[tooltipSlideDown_300ms_ease-out]';
  if (position === 'left') return 'animate-[tooltipSlideLeft_300ms_ease-out]';
  return 'animate-[tooltipSlideRight_300ms_ease-out]';
}

export function Tooltip({
  variant = 'descriptive',
  position = 'top-left',
  text = 'Context here',
  description = "BIT Bengaluru has requested additional verification for Sarah's education history. The cost must be approved to proceed.",
  actionLabel = 'Learn More',
  onActionClick,
  width,
  className,
  bubbleClassName,
}: TooltipProps) {
  const widthStyle =
    width === undefined ? undefined : { width: typeof width === 'number' ? `${width}px` : width };
  const animClass = getTooltipAnimation(position);

  const bubbleAlign = bubbleEdgeAlignClass(position);

  const content =
    variant === 'basic' ? (
      <div
        className={cn(
          basicBubbleVariants(),
          'relative z-[1]',
          bubbleAlign,
          getShadowClassName('300'),
          bubbleClassName,
        )}
        style={widthStyle}
      >
        {text}
      </div>
    ) : (
      <div
        className={cn(
          descriptiveBubbleVariants(),
          'relative z-[1]',
          bubbleAlign,
          getShadowClassName('700'),
          bubbleClassName,
        )}
        style={widthStyle}
      >
        <p className="text-body-sm font-medium leading-[20px] tracking-body-sm text-text-subheading">
          {description}
        </p>
        <Button
          variant="link"
          className="min-h-0"
          onClick={onActionClick}
          rightIcon={<ChevronRight className="size-4" />}
        >
          {actionLabel}
        </Button>
      </div>
    );

  const caretAlign = position.endsWith('right')
    ? 'justify-end pr-3'
    : position.endsWith('left')
      ? 'justify-start pl-3'
      : 'justify-center';

  const positionedCaret = (
    <div className={cn('flex w-full shrink-0', caretAlign)}>
      <Arrow position={position} variant={variant} />
    </div>
  );

  if (position === 'left' || position === 'right') {
    return (
      <div className={cn(tooltipContainerVariants({ position }), animClass, className)}>
        {position === 'right' ? (
          <>
            <Arrow position={position} variant={variant} />
            {content}
          </>
        ) : (
          <>
            {content}
            <Arrow position={position} variant={variant} />
          </>
        )}
      </div>
    );
  }

  if (position.startsWith('bottom')) {
    return (
      <div className={cn(tooltipContainerVariants({ position }), animClass, className)}>
        {positionedCaret}
        {content}
      </div>
    );
  }

  return (
    <div className={cn(tooltipContainerVariants({ position }), animClass, className)}>
      {content}
      {positionedCaret}
    </div>
  );
}
