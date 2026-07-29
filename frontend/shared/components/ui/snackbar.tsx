'use client';

import { type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { Button } from './button';
import { SvgIcon } from './svg-icon';
import closeIcon from '@/public/assets/icons/close-md/Close_MD=16px.svg';

/* ═══════════════════════════════════════════════════════════════════════════
 * RDS Snackbar — Figma node 3170:3263.
 *
 * Two layers:
 *   1) `Snackbar` — presentational only. Six visual variants
 *      ({ Light, Dark } × { Text Only, Text & Subtext, Text & Subtext with
 *      Longer Action }). Stateless: caller wires `onAction` and `onClose`.
 *   2) `snackbar.show(...)` / `snackbar.dismiss(...)` — imperative API that
 *      delegates lifecycle (queue, auto-dismiss timer, enter/exit animation,
 *      mount/unmount) to Sonner via `toast.custom`. Mirrors the existing
 *      `toast` API style, but renders the RDS visual instead of a Sonner toast.
 *
 * The action button is for "undo"-style cancellation: clicking it skips the
 * `onCommit` callback. Anything else that dismisses the snackbar (auto-dismiss
 * timer, close button, programmatic `snackbar.dismiss`) fires `onCommit`.
 * ═══════════════════════════════════════════════════════════════════════ */

export type SnackbarTheme = 'Light' | 'Dark';
export type SnackbarConfiguration =
  | 'Text Only'
  | 'Text & Subtext'
  | 'Text & Subtext with Longer Action';

const snackbarVariants = cva(
  'flex w-[500px] max-w-[600px] overflow-hidden rounded-md shadow-[0px_3px_10px_0px_rgba(11,26,59,0.06)] px-4 py-3',
  {
    variants: {
      theme: {
        Light: 'bg-white border border-neutral-500 text-text-body',
        Dark: 'bg-accent-800 text-white',
      },
      configuration: {
        'Text Only': 'gap-6 items-center justify-end',
        'Text & Subtext': 'gap-6 items-center',
        'Text & Subtext with Longer Action': 'flex-col gap-3 items-end',
      },
    },
    defaultVariants: {
      theme: 'Dark',
      configuration: 'Text Only',
    },
  },
);

export interface SnackbarProps extends VariantProps<typeof snackbarVariants> {
  title: ReactNode;
  subtext?: ReactNode;
  showAction?: boolean;
  actionLabel?: string;
  actionLeftIcon?: ReactNode;
  onAction?: () => void;
  showCloseIcon?: boolean;
  onClose?: () => void;
  className?: string;
}

export function Snackbar({
  title,
  subtext,
  configuration = 'Text Only',
  theme = 'Dark',
  showAction = false,
  actionLabel,
  actionLeftIcon,
  onAction,
  showCloseIcon = true,
  onClose,
  className,
}: SnackbarProps) {
  const isLongerAction = configuration === 'Text & Subtext with Longer Action';
  const isTextOnly = configuration === 'Text Only';
  const titleClass = isTextOnly
    ? 'text-body-md font-medium leading-[20px] tracking-body-md'
    : `text-subtitle-md font-semibold leading-[24px] ${
        theme === 'Dark' ? 'text-white' : 'text-text-body'
      }`;
  const subtextClass = `text-body-md font-normal leading-[22px] tracking-body-md ${
    theme === 'Dark' ? 'text-accent-100' : 'text-text-subheading'
  }`;
  const actionLinkClass =
    theme === 'Dark'
      ? '!text-primary-300 hover:!text-primary-300 hover:!underline'
      : '!text-text-link hover:!text-text-link hover:!underline';
  const closeIconColor =
    theme === 'Dark' ? 'text-white' : 'text-icon-default';

  const closeButton = showCloseIcon ? (
    <button
      type="button"
      aria-label="Dismiss"
      onClick={onClose}
      className="inline-flex size-4 shrink-0 items-center justify-center"
    >
      <SvgIcon src={closeIcon} size={4} color={closeIconColor} alt="Close" />
    </button>
  ) : null;

  const actionButton =
    showAction && actionLabel ? (
      <Button
        variant="link"
        onClick={onAction}
        leftIcon={actionLeftIcon}
        className={cn('whitespace-nowrap', actionLinkClass)}
      >
        {actionLabel}
      </Button>
    ) : null;

  return (
    <div className={cn(snackbarVariants({ theme, configuration }), className)}>
      {isLongerAction ? (
        <>
          <div className="flex w-full items-start gap-6">
            <div className="flex flex-1 min-w-0 flex-col gap-1">
              <p className={cn(titleClass, 'w-full')}>{title}</p>
              {subtext ? <p className={cn(subtextClass, 'w-full')}>{subtext}</p> : null}
            </div>
            {closeButton}
          </div>
          {actionButton}
        </>
      ) : configuration === 'Text & Subtext' ? (
        <>
          <div className="flex flex-1 min-w-0 flex-col gap-1">
            <p className={cn(titleClass, 'w-full')}>{title}</p>
            {subtext ? <p className={cn(subtextClass, 'w-full')}>{subtext}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-6">
            {actionButton}
            {closeButton}
          </div>
        </>
      ) : (
        <>
          <p className={cn(titleClass, 'flex-1 min-w-0')}>{title}</p>
          <div className="flex shrink-0 items-center gap-6">
            {actionButton}
            {closeButton}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Imperative API ────────────────────────────────────────────────────── */

export interface SnackbarShowOptions
  extends Omit<SnackbarProps, 'onClose' | 'onAction'> {
  /** Auto-dismiss delay in ms. Defaults to Sonner's default (~4s). */
  duration?: number;
  /**
   * Fired when the action button is clicked. The snackbar dismisses itself
   * afterwards and `onCommit` will NOT fire — the action is treated as a cancel.
   */
  onAction?: () => void;
  /**
   * Fired when the snackbar dismisses for any reason except the action button:
   * auto-dismiss timer, close icon, or programmatic `snackbar.dismiss()`.
   * Use this to commit deferred work (e.g. send the actual mutation request).
   */
  onCommit?: () => void;
}

function showSnackbar(options: SnackbarShowOptions): string | number {
  const {
    duration,
    onAction,
    onCommit,
    showAction = false,
    showCloseIcon = true,
    ...rest
  } = options;

  let actionClicked = false;
  let committed = false;

  // Sonner fires BOTH onDismiss and onAutoClose on the auto-close path.
  // Gate via `committed` so the second callback is a no-op.
  const fireCommit = () => {
    if (actionClicked || committed) return;
    committed = true;
    onCommit?.();
  };

  return toast.custom(
    (id) => (
      <Snackbar
        {...rest}
        showAction={showAction}
        showCloseIcon={showCloseIcon}
        onAction={
          showAction
            ? () => {
                actionClicked = true;
                onAction?.();
                toast.dismiss(id);
              }
            : undefined
        }
        onClose={showCloseIcon ? () => toast.dismiss(id) : undefined}
      />
    ),
    {
      duration,
      // Neutralize the global Toaster wrapper styles (white bg, padding,
      // border, max-width, overflow-hidden) so our custom Snackbar visual
      // owns the entire toast cell. `style.width: 'auto'` overrides Sonner's
      // inline `width: var(--width)` (defaults to 356px) so our 500px bar
      // isn't clipped.
      unstyled: true,
      style: { width: 'auto' },
      classNames: {
        toast:
          '!p-0 !bg-transparent !border-0 !shadow-none !w-auto !max-w-none !overflow-visible',
      },
      onDismiss: fireCommit,
      onAutoClose: fireCommit,
    },
  );
}

export const snackbar = {
  show: showSnackbar,
  dismiss: (id?: string | number) => toast.dismiss(id),
};
