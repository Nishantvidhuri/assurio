'use client';

import { useRef, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib/utils';
import { Button, type ButtonProps } from './button';
import { ButtonContainer } from './button-container';
import { Sheen } from './sheen';

const DIALOG_ANIM_DURATION = 300;

/**
 * Dialog stacking state (module scoped).
 *
 * Why this exists:
 * Nested dialogs are allowed (e.g. Edit modal -> File preview modal). Without
 * a stack, both layers may react to the same Escape/outside-click and close at
 * once. We keep a simple LIFO stack so only the top-most dialog can close from
 * global interactions.
 */
let nextDialogId = 1;
const openDialogStack: number[] = [];

function pushDialog(dialogId: number) {
  const existingIndex = openDialogStack.indexOf(dialogId);
  if (existingIndex >= 0) {
    openDialogStack.splice(existingIndex, 1);
  }
  openDialogStack.push(dialogId);
}

function popDialog(dialogId: number) {
  const index = openDialogStack.indexOf(dialogId);
  if (index >= 0) {
    openDialogStack.splice(index, 1);
  }
}

function isTopDialog(dialogId: number): boolean {
  return openDialogStack[openDialogStack.length - 1] === dialogId;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * RDS Dialog Box base — Figma nodes 3037:1249 (center), 3037:2324 (right panel)
 *
 * Token mapping:
 *   Overlay        → Sheen component (Figma 3038:38)
 *   Dialog card    → bg-white, overflow-clip, shadow-200
 *   Center panel   → rounded-lg (12px)
 *   Right panel    → full-height, left-corners rounded (4px)
 *   Close-on-click → useClickOutside hook on the dialog ref
 *   Body scroll    → locked when open
 *   Footer actions → optional secondary/primary buttons
 *
 * @example
 * ```tsx
 * <DialogBox open={isOpen} onClose={() => setIsOpen(false)}>
 *   <div className="p-5">Content here</div>
 * </DialogBox>
 * ```
 * ═══════════════════════════════════════════════════════════════════════ */

export interface DialogBoxProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /**
   * Extra classes for the backdrop wrapper (the element that holds the
   * Sheen + outside-click handler). Use this to add effects like
   * `backdrop-blur-sm` for onboarding-style dialogs without touching every
   * caller of DialogBox.
   */
  backdropClassName?: string;
  placement?: 'center' | 'right' | 'bottom';
  secondaryAction?: {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
  };
  primaryAction?: {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    isLoading?: boolean;
    variant?: ButtonProps['variant'];
  };
  footer?: ReactNode;
  closeOnOutsideClick?: boolean;
  closeOnEscape?: boolean;
}

export function DialogBox({
  open,
  onClose,
  children,
  className,
  backdropClassName,
  placement = 'center',
  secondaryAction,
  primaryAction,
  footer,
  closeOnOutsideClick = true,
  closeOnEscape = true,
}: DialogBoxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogIdRef = useRef<number>(nextDialogId++);
  const [shouldRender, setShouldRender] = useState(open);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      // Force browser to paint the initial (hidden) state before transitioning in.
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => {
          setIsVisible(true);
        });
        return () => cancelAnimationFrame(raf2);
      });
      return () => cancelAnimationFrame(raf1);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setShouldRender(false), DIALOG_ANIM_DURATION);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dialogId = dialogIdRef.current;

    // Register this dialog as active while open.
    pushDialog(dialogId);
    return () => {
      // Ensure stack cleanup on close/unmount.
      popDialog(dialogId);
    };
  }, [open]);

  const handleSheenClick = () => {
    if (!open || !closeOnOutsideClick) return;

    // Only the latest opened dialog can close on outside click.
    if (!isTopDialog(dialogIdRef.current)) return;
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      // Prevent parent dialogs from also closing when a child dialog is open.
      if (!isTopDialog(dialogIdRef.current)) return;
      onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [closeOnEscape, open, onClose]);

  if (!shouldRender) return null;

  const hasActions = !!secondaryAction || !!primaryAction;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-50',
        placement === 'center'
          ? 'flex items-center justify-center p-4'
          : placement === 'bottom'
            ? 'flex items-end justify-center'
            : 'flex items-stretch justify-end',
      )}
    >
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-300',
          isVisible ? 'opacity-100' : 'opacity-0',
        )}
        onClick={handleSheenClick}
      >
        {/* Apply backdropClassName to the Sheen so the filter lands on an
            element with its own `bg-neutral-800/20` — guarantees a render
            layer, which transparent wrappers don't always produce. */}
        <Sheen className={cn('absolute inset-0', backdropClassName)} />
      </div>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative flex flex-col bg-white shadow-[0px_3px_10px_0px_rgba(11,26,59,0.06)]',
          'transition-all duration-300 ease-in-out',
          placement === 'center'
            ? cn(
                'overflow-hidden rounded-lg',
                isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-90 translate-y-4',
              )
            : placement === 'bottom'
              ? cn(
                  'w-full overflow-y-auto rounded-t-lg rounded-b-none',
                  isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full',
                )
              : cn(
                  'ml-auto h-full overflow-hidden rounded-l-sm rounded-r-none',
                  isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full',
                ),
          className,
        )}
      >
        <div
          className={cn(
            'flex flex-col',
            placement === 'bottom' ? 'shrink-0' : 'min-h-0 flex-1',
          )}
        >
          {children}
        </div>

        <div className="shrink-0">
          {footer
            ? footer
            : hasActions && (
                <ButtonContainer alignment="Right" configuration="With Padding">
                  {secondaryAction ? (
                    <Button
                      variant="secondary"
                      onClick={secondaryAction.onClick ?? onClose}
                      disabled={secondaryAction.disabled}
                    >
                      {secondaryAction.label}
                    </Button>
                  ) : null}
                  {primaryAction ? (
                    <Button
                      variant={primaryAction.variant ?? 'primary'}
                      onClick={primaryAction.onClick}
                      disabled={primaryAction.disabled}
                      isLoading={primaryAction.isLoading}
                    >
                      {primaryAction.label}
                    </Button>
                  ) : null}
                </ButtonContainer>
              )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
