'use client';

import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ChevronRight, Star } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  HoverTooltipAnchor,
  type SupportedTooltipPosition,
} from './hover-tooltip-anchor';
import { Badge } from './badge';
import { Checkbox } from './checkbox';
import { Divider } from './divider';
import { RadioButton } from './radio-button';
import { Switch } from './switch';
import { Tag } from './tag';

export type MenuItemState = 'Default' | 'On Hover';
export type MenuItemType = 'Text' | 'Chip';
export type MenuItemLeadingElementType =
  | 'Icon'
  | 'Badge'
  | 'Indent'
  | 'Checkbox'
  | 'Radio';
export type MenuItemTrailingElementType = 'Icon' | 'Text' | 'Badges' | 'Switch';

export interface MenuItemLeadingElementProps {
  type?: MenuItemLeadingElementType;
  icon?: ReactNode;
  className?: string;
}

export function MenuItemLeadingElement({
  type = 'Icon',
  icon,
  className,
}: MenuItemLeadingElementProps) {
  if (type === 'Indent') {
    return <span className={cn('block size-5 shrink-0', className)} aria-hidden />;
  }
  if (type === 'Badge') {
    return <Badge className={className} size="Small" type="Primary" />;
  }
  if (type === 'Checkbox') {
    return <Checkbox className={className} size="Medium" checked={false} />;
  }
  if (type === 'Radio') {
    return <RadioButton className={className} size="Medium" checked={false} />;
  }
  return (
    <span className={cn('inline-flex size-5 items-center justify-center text-text-body [&>svg]:size-4', className)}>
      {icon ?? <Star className="size-4" />}
    </span>
  );
}

export interface MenuItemTrailingElementProps {
  type?: MenuItemTrailingElementType;
  icon?: ReactNode;
  text?: string;
  switchChecked?: boolean;
  className?: string;
}

export function MenuItemTrailingElement({
  type = 'Icon',
  icon,
  text = 'Text',
  switchChecked = false,
  className,
}: MenuItemTrailingElementProps) {
  if (type === 'Text') {
    return (
      <span className={cn('text-body-sm font-medium leading-[20px] tracking-body-sm text-text-subheading', className)}>
        {text}
      </span>
    );
  }
  if (type === 'Badges') {
    return <Badge className={className} size="Small" type="Primary" />;
  }
  if (type === 'Switch') {
    return <Switch className={className} checked={switchChecked} />;
  }
  return (
    <span className={cn('inline-flex size-4 items-center justify-center text-text-body [&>svg]:size-4', className)}>
      {icon ?? <ChevronRight className="size-4" />}
    </span>
  );
}

export interface MenuItemProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  state?: MenuItemState;
  itemType?: MenuItemType;
  menuText?: string;
  labelContent?: ReactNode;
  subtext?: string;
  showSubtext?: boolean;
  showDivider?: boolean;
  leadingElement?: ReactNode;
  trailingElement?: ReactNode;
  chipLabel?: string;
  disableInteraction?: boolean;
  className?: string;
  /** Allows overriding padding/spacing on the internal <button>. */
  buttonClassName?: string;
  /** Allows overriding typography on the optional subtext line. */
  subtextClassName?: string;
  /** Allows overriding typography on the optional subtext line via inline style. */
  subtextStyle?: React.CSSProperties;
  /** Allows overriding typography on the menuText. */
  menuTextClassName?: string;
  /** Fires when the mouse enters the entire menu item row (including padding). */
  onItemMouseEnter?: () => void;
  /**
   * When set, the whole row is wrapped in a hover tooltip. Useful to explain
   * why a `disableInteraction` item is unavailable: the wrapper (not the
   * disabled <button>, which suppresses pointer events) owns the hover.
   */
  tooltip?: string;
  /** Placement for `tooltip`. Defaults to 'top-center'. */
  tooltipPosition?: SupportedTooltipPosition;
}

/**
 * RDS Menu Item — Figma node 3106:682
 */
export function MenuItem({
  state = 'Default',
  itemType = 'Text',
  menuText = 'Menu Item',
  labelContent,
  subtext = 'Subtext',
  showSubtext = false,
  showDivider = false,
  leadingElement,
  trailingElement,
  chipLabel = 'Value',
  disableInteraction,
  className,
  buttonClassName,
  subtextClassName,
  subtextStyle,
  menuTextClassName,
  onItemMouseEnter,
  tooltip,
  tooltipPosition = 'top-center',
  ...props
}: MenuItemProps) {
  const row = (
    <div
      onMouseEnter={onItemMouseEnter}
      className={cn(
        // `w-full` so the row (and its hover background) fills the container
        // even when wrapped in the tooltip anchor's inline-flex span, where a
        // flex item would otherwise shrink to its content width.
        "flex w-full flex-col gap-1 py-0.5",
        state === "On Hover"
          ? "bg-[var(--color-primary-bg)]"
          : "bg-white hover:bg-[var(--color-primary-bg)]",
        className,
      )}
    >
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
          buttonClassName,
          disableInteraction && "cursor-not-allowed opacity-50",
        )}
        disabled={disableInteraction}
        {...props}
      >
        {leadingElement ? leadingElement : null}

        <span className="flex min-w-0 flex-1 flex-col justify-center text-body-md">
          {itemType === "Chip" ? (
            <Tag label={chipLabel} variant="Default" />
          ) : labelContent ? (
            labelContent
          ) : (
            <>
              <span className={cn("text-body-md font-medium leading-[20px] tracking-body-md text-text-body whitespace-nowrap",menuTextClassName)}>
                {menuText}
              </span>
              {showSubtext ? (
                <span
                  className={cn(
                    "font-medium text-text-subheading",
                    "leading-[20px] tracking-body-sm",
                    subtextClassName,
                  )}
                  style={subtextStyle}
                >
                  {subtext}
                </span>
              ) : null}
            </>
          )}
        </span>

        {trailingElement ? trailingElement : null}
      </button>

      {showDivider ? <Divider orientation="Horizontal" emphasis="Low" /> : null}
    </div>
  );

  if (!tooltip) {
    return row;
  }

  return (
    <HoverTooltipAnchor
      text={tooltip}
      position={tooltipPosition}
      className="w-full"
    >
      {row}
    </HoverTooltipAnchor>
  );
}
