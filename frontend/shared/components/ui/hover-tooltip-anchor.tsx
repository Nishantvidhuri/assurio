'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib/utils';
import { Tooltip, type TooltipProps } from './tooltip';

export type SupportedTooltipPosition =
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'top-left'
  | 'top-center'
  | 'top-right';

interface HoverTooltipAnchorProps {
  children: ReactNode;
  text: string;
  position?: SupportedTooltipPosition;
  className?: string;
  tooltipClassName?: string;
  gap?: number;
  offsetX?: number;
  offsetY?: number;
}

function getFixedPositionStyle(
  rect: DOMRect,
  position: SupportedTooltipPosition,
  gap: number,
): {
  top: number;
  left?: number;
  right?: number;
  transform?: string;
} {
  switch (position) {
    case 'bottom-left':
      return { top: rect.bottom + gap, left: rect.left, transform: 'translateX(0)' };
    case 'bottom-center':
      return {
        top: rect.bottom + gap,
        left: rect.left + rect.width / 2,
        transform: 'translateX(-50%)',
      };
    case 'bottom-right':
      return {
        top: rect.bottom + gap,
        right: window.innerWidth - rect.right - 13,
      };
    case 'top-left':
      return {
        top: rect.top - gap,
        left: rect.left,
        transform: 'translateY(-100%)',
      };
    case 'top-center':
      return {
        top: rect.top - gap,
        left: rect.left + rect.width / 2,
        transform: 'translate(-50%, -100%)',
      };
    case 'top-right':
      return {
        top: rect.top - gap,
        right: window.innerWidth - rect.right - 13,
        transform: 'translateY(-100%)',
      };
  }
}

// Module-level registry so a tap-opened tooltip closes any other one
// already open. Keyed by stable id; the value is the `close()` callback.
const tapTooltipRegistry = new Map<string, () => void>();

function closeOtherTapTooltips(exceptId: string) {
  for (const [id, close] of tapTooltipRegistry) {
    if (id !== exceptId) close();
  }
}

export function HoverTooltipAnchor({
  children,
  text,
  position = 'bottom-right',
  className,
  tooltipClassName,
  gap = 8,
  offsetX = 0,
  offsetY = 0,
}: HoverTooltipAnchorProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  // Tracks *how* the tooltip opened. Hover-driven ones close on
  // mouse-leave; tap-driven ones close on outside-tap or when another
  // tap-tooltip opens. Without this split, a tap-opened tip would
  // disappear the moment the finger moved off the anchor.
  const [openedByTap, setOpenedByTap] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setOpenedByTap(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    const syncPosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchorRect(rect);
    };

    syncPosition();
    window.addEventListener('resize', syncPosition);
    window.addEventListener('scroll', syncPosition, true);

    return () => {
      window.removeEventListener('resize', syncPosition);
      window.removeEventListener('scroll', syncPosition, true);
    };
  }, [open]);

  // Register in the tap-tooltip registry whenever this one is open via
  // tap, so a sibling tap-open can dismiss us.
  useEffect(() => {
    if (!openedByTap) return;
    tapTooltipRegistry.set(id, close);
    return () => {
      tapTooltipRegistry.delete(id);
    };
  }, [openedByTap, id, close]);

  // Outside-tap dismissal — only relevant for tap-opened tooltips.
  useEffect(() => {
    if (!openedByTap) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && anchorRef.current?.contains(target)) return;
      close();
    };

    // Defer one tick so the same tap that opened us isn't immediately
    // caught here and closes it.
    const timeoutId = window.setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDown, true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [openedByTap, close]);

  const tooltipStyle = useMemo(() => {
    if (!anchorRect) return null;

    const { top, left, right, transform } = getFixedPositionStyle(
      anchorRect,
      position,
      gap,
    );

    return {
      top: top + offsetY,
      left: typeof left === 'number' ? left + offsetX : undefined,
      right: typeof right === 'number' ? right - offsetX : undefined,
      transform,
    };
  }, [anchorRect, gap, offsetX, offsetY, position]);

  const tooltipPosition = position as TooltipProps['position'];

  const handleMouseEnter = () => {
    if (openedByTap) return;
    setOpen(true);
  };

  const handleMouseLeave = () => {
    if (openedByTap) return;
    setOpen(false);
  };

  // Tap / click toggles the tooltip on touch (and pen) pointers.
  // Mouse clicks are ignored because hover already handles desktop —
  // toggling on mouse-click would feel like a flicker.
  const handlePointerUp = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (event.pointerType === 'mouse') return;

    if (open && openedByTap) {
      close();
      return;
    }

    closeOtherTapTooltips(id);
    setOpenedByTap(true);
    setOpen(true);
  };

  return (
    <>
      <span
        ref={anchorRef}
        className={cn('inline-flex', className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocusCapture={(e) => {
          if (openedByTap) return;
          const target = e.target as HTMLElement | null;
          if (!target || typeof target.matches !== 'function') return;
          if (!target.matches(':focus-visible')) return;
          setOpen(true);
        }}
        onBlurCapture={() => {
          if (!openedByTap) setOpen(false);
        }}
        onPointerUp={handlePointerUp}
      >
        {children}
      </span>

      {typeof document !== 'undefined' && open && tooltipStyle
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[200] opacity-100 transition-opacity duration-150"
              style={tooltipStyle}
            >
              <Tooltip
                variant="basic"
                position={tooltipPosition}
                text={text}
                className={cn('text-caption px-2 py-1', tooltipClassName)}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
