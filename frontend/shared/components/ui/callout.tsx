'use client';

import { useState, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check, TriangleAlert } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button, type ButtonProps } from './button';
import { SvgIcon } from './svg-icon';
import infoIcon from '@/public/assets/icons/info/Info=20px.svg'
import closeIcon from '@/public/assets/icons/close-md/Close_MD=16px.svg'
import closeErrorIcon from '@/public/assets/icons/close-sm/Close_SM_RedBG.svg'
import Image from 'next/image';
import warningIcon from '@/public/assets/icons/warning/Warning=20px.svg'

export type CalloutState = 'Info' | 'Success' | 'Error' | 'Warning' | 'Empty';
export type CalloutConfiguration = 'Text Only' | 'Text & Subtext';

const calloutVariants = cva(
  'w-full rounded-md border p-3',
  {
    variants: {
      state: {
        Info: 'bg-surface-info border-border-focused',
        Success: 'bg-surface-success border-border-success',
        Error: 'bg-surface-error border-border-failure',
        Warning: 'bg-surface-warning border-border-warning',
        Empty: 'bg-surface-error border-border-failure',
      },
    },
    defaultVariants: {
      state: 'Info',
    },
  },
);

/**
 * RDS Callout — Figma node 3178:4751.
 *
 * - Supports 4 states: Info, Success, Error, Warning
 * - Supports 2 configurations: Text Only, Text & Subtext
 * - Optional link action button (uses base Button)
 * - Optional close icon; closing hides the callout
 *
 * Positioning (as shown in Figma node 3178:5115) is layout-driven by the
 * parent container, so this component is intentionally width/layout agnostic.
 */
export interface CalloutProps extends VariantProps<typeof calloutVariants> {
  configuration?: CalloutConfiguration;
  title: ReactNode;
  subtext?: ReactNode;
  showAction?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  actionButtonProps?: Omit<ButtonProps, 'children' | 'variant' | 'onClick'>;
  showCloseIcon?: boolean;
  onClose?: () => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * When true, allow `title` / `subtext` to wrap onto multiple lines instead
   * of truncating. Default keeps the existing single-line + ellipsis layout
   * for callsites that rely on a fixed callout height.
   */
  multiline?: boolean;
  /**
   * Optional override for the leading icon. Pass any node — usually an
   * `<SvgIcon src={…} />` — and it replaces the default state-based icon
   * (info-blue / warning / etc). Omit to keep the existing behavior.
   * Use this for slot/appointment callouts that want a calendar icon
   * without bespoke wrapper styling.
   */
  leadingIcon?: ReactNode;
  className?: string;
}

function CalloutLeadingIcon({ state = 'Info' }: { state: CalloutState }) {
  if (state === 'Success') {
    return (
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-icon-success">
        <Check className="size-3 text-white" />
      </span>
    );
  }

  if (state === 'Error') {
    return (
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full">
        <Image src={closeErrorIcon} alt='Close' />
      </span>
    );
  }

  if (state === 'Warning') {
    return <TriangleAlert className="size-5 shrink-0 text-warning" />;
  }

  if (state === 'Empty') {
    return (
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-failure">
        <SvgIcon src={warningIcon} size={5} color='text-white' alt='Warning' />
      </span>
    );
  }

  return <SvgIcon src={infoIcon} size={5} color='text-primary' alt='Info' />;
}

export function Callout({
  state = 'Info',
  configuration = 'Text Only',
  title,
  subtext,
  showAction = true,
  actionLabel = 'Action',
  onAction,
  actionButtonProps,
  showCloseIcon = true,
  onClose,
  open,
  defaultOpen = true,
  onOpenChange,
  multiline = false,
  leadingIcon,
  className,
}: CalloutProps) {


  const textWrapClass = 'break-words';
  const resolvedState: CalloutState = state ?? 'Info';
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const visible = isControlled ? open : internalOpen;

  const close = () => {
    if (!isControlled) {
      setInternalOpen(false);
    }
    onOpenChange?.(false);
    onClose?.();
  };

  if (!visible) return null;

  const isTextAndSubtext = configuration === 'Text & Subtext';
  const actionClassName =
    resolvedState === 'Error' || resolvedState === 'Empty'
      ? '!text-failure hover:!text-failure active:!text-failure hover:!no-underline active:!no-underline'
      : 'hover:!no-underline active:!no-underline';

  return (
    <div className={cn(calloutVariants({ state: resolvedState }), className)}>
      {/* Outer row: text block (+ action on mobile, stacked below) | close.
          On md+ everything is back in a single horizontal row. */}
      <div className="flex items-start justify-between gap-3 md:items-center md:gap-6">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-3 md:flex-row md:items-center md:gap-6">
          <div className="flex min-w-0 flex-1 items-start gap-3 md:items-center">
            {leadingIcon !== undefined ? (
              leadingIcon
            ) : (
              <CalloutLeadingIcon state={resolvedState} />
            )}

            {isTextAndSubtext ? (
              <div className="flex min-w-0 flex-col justify-center pb-0.5">
                <p className={`${textWrapClass} text-body-md font-medium leading-body-s tracking-body-md text-text-body`}>
                  {title}
                </p>
                <p className={`${textWrapClass} text-body-sm font-medium leading-body-s tracking-body-sm text-text-subheading`}>
                  {subtext ?? ''}
                </p>
              </div>
            ) : (
              <p className={`${textWrapClass} text-body-sm font-medium leading-body-s tracking-body-sm text-text-body`}>
                {title}
              </p>
            )}
          </div>

          {showAction ? (
            <div className="self-start pl-8 md:pl-0 md:self-auto">
              <Button
                variant="link"
                className={cn(actionClassName, 'shrink-0')}
                onClick={onAction}
                {...actionButtonProps}
              >
                {actionLabel}
              </Button>
            </div>
          ) : null}
        </div>

        {showCloseIcon ? (
          <button
            type="button"
            aria-label="Close callout"
            onClick={close}
            className="inline-flex size-4 shrink-0 items-center justify-center text-icon-default transition-colors hover:text-text-body"
          >
            <SvgIcon src={closeIcon} alt='Close' />
          </button>
        ) : null}
      </div>
    </div>
  );
}
