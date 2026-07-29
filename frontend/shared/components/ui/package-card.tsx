'use client';

import Image from 'next/image';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useClickOutside } from '@/shared/hooks/use-click-outside';
import { useAnimatedToggle } from '@/shared/hooks/use-animated-toggle';
import { cn } from '@/shared/lib/utils';
import { Divider } from './divider';
import { Menu } from './menu';
import { Tag } from './tag';
import { SvgIcon } from './svg-icon';
import moreVerticalIcon from '@/public/assets/icons/more-vertical/More_Vertical=16px.svg'
import checkIcon from '@/public/assets/icons/check-big/Check_Big=16px.svg'
import creditsCoin from '@/public/assets/client-billing/credits-coin.png'
import rupeeCoin from '@/public/assets/client-billing/rupee-coin.png'

export type PackageCardSizeValue = number | string;

export interface PackageCardIncludedItem {
  label: string;
  // Rich rendering for the row (e.g. an OR slot where the chosen alternative
  // is emphasised and the rest are muted). Falls back to `label`.
  labelNode?: ReactNode;
  iconSrc?: string | null;
  // Right-aligned per-row action — used by OR slots for their "Select" link.
  actionSlot?: ReactNode;
}

export interface PackageCardProps {
  packageName: string;
  description: string;
  price: number | string;
  currency?: string;
  priceSuffix?: string;
  /**
   * Coin rendered next to the price: the credits coin for prepaid orgs
   * (default, so every existing prepaid/internal call site is untouched) or
   * the rupee coin for postpaid orgs (per the postpaid Figma screens, the
   * price stays a bare number — the coin carries the currency).
   */
  priceIconVariant?: 'credits' | 'rupee';
  unitsLabel?: string;
  includedItems: Array<string | PackageCardIncludedItem>;
  previewChecksCount?: number;
  onViewAllChecks?: () => void;
  selected?: boolean;
  /**
   * When true, the card renders greyed-out and cannot be selected, customized,
   * or marked as default. Used to show a package that is not available to the
   * current client.
   */
  disabled?: boolean;
  unavailableLabel?: string;
  showMostPopularTag?: boolean;
  mostPopularLabel?: string;
  showDefaultTag?: boolean;
  defaultTagLabel?: string;
  width?: PackageCardSizeValue;
  height?: PackageCardSizeValue;
  paddingX?: number;
  paddingLeft?: number;
  paddingRight?: number;
  className?: string;
  style?: CSSProperties;
  rightSlot?: ReactNode;
  priceActionSlot?: ReactNode;
  /**
   * Optional badge / chip pinned to the top-left corner of the card,
   * outside the article boundary (overflowing upwards). Used by the
   * client Packages page to render the "Recommended" chip on the
   * featured package.
   */
  topLeftBadge?: ReactNode;
  checksClassName?: string;
  onCardClick?: () => void;
  onMarkAsDefault?: () => void;
}

function normalizeIncludedItem(item: string | PackageCardIncludedItem) {
  if (typeof item === 'string') {
    return {
      label: item,
      labelNode: null,
      iconSrc: null,
      actionSlot: null,
    };
  }

  return {
    label: item.label,
    labelNode: item.labelNode ?? null,
    iconSrc: item.iconSrc ?? null,
    actionSlot: item.actionSlot ?? null,
  };
}

function isRenderableImageSrc(value: string | null): value is string {
  if (!value) return false;

  return value.startsWith('/') || value.startsWith('http://') || value.startsWith('https://');
}

/**
 * PackageCard — shared package overview card used by package-based modules.
 * Origin: client-packages module, promoted to shared UI for reuse.
 */
export function PackageCard({
  packageName,
  description,
  price,
  currency = '',
  priceSuffix = 'unit',
  priceIconVariant = 'credits',
  unitsLabel,
  includedItems,
  previewChecksCount,
  onViewAllChecks,
  selected = false,
  disabled = false,
  unavailableLabel = 'Unavailable',
  showMostPopularTag = false,
  mostPopularLabel = 'Most Popular',
  showDefaultTag = false,
  defaultTagLabel = 'Default',
  topLeftBadge,
  width,
  paddingX = 20,
  paddingLeft,
  paddingRight,
  className,
  style,
  rightSlot,
  priceActionSlot,
  checksClassName,
  onCardClick,
  onMarkAsDefault,
}: PackageCardProps) {
  const resolvedLeft = paddingLeft ?? paddingX;
  const resolvedRight = paddingRight ?? paddingX;
  const isSelected = selected && !disabled;
  const isClickable = Boolean(onCardClick) && !disabled;
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [checksExpanded, setChecksExpanded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setMenuOpen(false));
  const { shouldRender: menuVisible, isVisible: menuAnimated } = useAnimatedToggle(menuOpen, 400);

  const cardStyle: CSSProperties = {
    width,
    paddingLeft: `${resolvedLeft}px`,
    paddingRight: `${resolvedRight}px`,
    ...(showMostPopularTag
      ? { paddingTop: '40px', paddingBottom: '40px' }
      : { paddingTop: '20px', paddingBottom: '20px' }),
    ...(disabled
      ? { background: '#f5f6f8' }
      : isSelected
        ? {
            background:
              'linear-gradient(180deg, rgba(0, 82, 255, 0.31) -5.84%, rgba(255, 255, 255, 0) 13.83%), #F9FBFF',
          }
        : isHovered
          ? { background: '#f9fbff' }
          : { background: '#fff' }),
    ...style,
  };

  return (
    <div
      className={cn('relative h-full', className)}
      {...(showMostPopularTag ? { 'data-most-popular': '' } : {})}
    >
      {showMostPopularTag ? (
        <div className="absolute left-1/2 top-0 z-10 flex h-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md bg-primary px-2.5 text-body-md font-normal leading-5 w-36 tracking-body-md text-white">
          {mostPopularLabel}
        </div>
      ) : null}

      {/*
        Recommended-chip layout mirrors the "Enhance Your Package with
        Add-ons" pattern: chip renders as an absolute-positioned block
        that OVERHANGS the card's top, then the article — with
        `relative z-10` + its own opaque `cardStyle.background` — paints
        on top of the chip in the overlap region. Because the article
        is later in DOM order and both have their own rounded corners,
        the chip is only visible where the article's rounded top-left
        corner is cut away — same layering the Enhance section relies
        on. Chip is 40px tall; article overlaps its bottom 16px so
        24px of chip is visible above the card border.
      */}
      {/* Unavailable package: drop the badge entirely — a "Recommended"
          chip on a card the user cannot pick is misleading, and it read
          as an odd full-strength block next to the dimmed card. */}
      {topLeftBadge && !disabled ? (
        <div
          className="pointer-events-none absolute left-0 top-0"
          style={{ zIndex: 0, transform: 'translateY(-32px)' }}
        >
          {topLeftBadge}
        </div>
      ) : null}

      <article
        className={cn(
          'flex h-full flex-col gap-4 rounded-md border transition-colors',
          // Recommended card: article sits ABOVE the chip in the
          // stacking context so its opaque background covers the chip
          // in the overlap area — the chip only shows where the
          // article's rounded top-left corner is cut away.
          topLeftBadge ? 'relative z-10' : undefined,
          disabled
            ? 'border-neutral-400 opacity-60'
            : isSelected
              ? 'border-primary shadow-[0_4px_20px_rgba(75,108,214,0.15)]'
              : 'border-neutral-500',
          isClickable ? 'cursor-pointer' : undefined,
          disabled ? 'cursor-not-allowed' : undefined,
        )}
        style={cardStyle}
        onClick={isClickable ? onCardClick : undefined}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        data-disabled={disabled || undefined}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-h4 font-medium leading-[28px] tracking-h4 text-text-heading">
                {packageName}
              </h3>
              {disabled ? (
                <Tag
                  variant="Default"
                  label={unavailableLabel}
                />
              ) : showDefaultTag ? (
                <Tag
                  variant="Info"
                  label={defaultTagLabel}
                />
              ) : null}
            </div>

            <div
              ref={menuRef}
              className="relative flex shrink-0 items-center gap-2"
              onClick={(event) => event.stopPropagation()}
            >
              {unitsLabel ? (
                <span className="text-body-lg font-semibold leading-6 tracking-body-lg text-primary">
                  {unitsLabel}
                </span>
              ) : null}
              {rightSlot ??
                (disabled ? null : (
                  <button
                    type="button"
                    aria-label="Open package menu"
                    className="inline-flex size-5 items-center justify-center text-text-body"
                    onClick={() => setMenuOpen((prev) => !prev)}
                  >
                    <SvgIcon src={moreVerticalIcon} color='text-text-body' alt='More' />
                  </button>
                ))}
              {!disabled && menuVisible ? (
                <div
                  className={`absolute right-0 top-full z-20 mt-1 transition-all duration-400 origin-top ${
                    menuAnimated ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
                  }`}
                >
                  <Menu
                    className="w-[252px]"
                    items={[
                      {
                        id: 'mark-default',
                        menuText: 'Mark this as default package',
                        disableInteraction: showDefaultTag,
                        onClick: () => {
                          if (showDefaultTag) return;
                          onMarkAsDefault?.();
                          setMenuOpen(false);
                        },
                      },
                    ]}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <p className="text-body-md font-normal leading-5.5 tracking-body-md text-text-subheading">
            {description}
          </p>
        </div>

        {/* Wraps rather than overflowing: a long price + a wide action (e.g.
            "Customize Package") drop onto separate lines instead of spilling
            past the card edge. */}
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
          <div className="flex shrink-0 items-end gap-2 whitespace-nowrap">
            <Image
              src={priceIconVariant === 'rupee' ? rupeeCoin : creditsCoin}
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0 object-contain"
              aria-hidden
            />
            <div className="flex items-end gap-px">
              <span className="text-[28px] font-semibold leading-8.5 tracking-[-0.25px] text-text-heading">
                {currency}
                {price} /
              </span>
              <span className="text-body-md font-regular leading-5.5 tracking-body-md text-text-subheading">
                {priceSuffix}
              </span>
            </div>
          </div>
          {!disabled && priceActionSlot ? (
            <div
              className="shrink-0 whitespace-nowrap"
              onClick={(event) => event.stopPropagation()}
            >
              {priceActionSlot}
            </div>
          ) : null}
        </div>

        <Divider orientation="Horizontal" emphasis="Low" />

        <ul className={cn("flex flex-1 flex-col gap-3", checksClassName)}>
          {(() => {
            const shouldTruncate =
              previewChecksCount != null && !checksExpanded;
            const visibleItems = shouldTruncate
              ? includedItems.slice(0, previewChecksCount)
              : includedItems;
            const remainingCount = shouldTruncate
              ? includedItems.length - visibleItems.length
              : 0;

            return (
              <>
                {visibleItems.map((item, index) => {
                  const normalizedItem = normalizeIncludedItem(item);

                  return (
                    <li
                      key={`${normalizedItem.label}-${index}`}
                      className="flex items-center gap-2"
                    >
                      {isRenderableImageSrc(normalizedItem.iconSrc) ? (
                        <SvgIcon
                          src={normalizedItem.iconSrc}
                          color='text-text-heading'
                          alt=""
                        />
                      ) : (
                        <SvgIcon src={checkIcon} color='text-text-heading' />
                      )}
                      <span className="min-w-0 flex-1 text-body-md font-normal leading-5 tracking-body-md text-text-body">
                        {normalizedItem.labelNode ?? normalizedItem.label}
                      </span>
                      {normalizedItem.actionSlot ? (
                        <span
                          className="shrink-0"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {normalizedItem.actionSlot}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
                {remainingCount > 0 ? (
                  <li>
                    <button
                      type="button"
                      className="text-body-md font-medium leading-[20px] tracking-body-md text-text-link hover:text-accent-700 hover:underline hover:decoration-[6%]"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (onViewAllChecks) {
                          onViewAllChecks();
                        } else {
                          setChecksExpanded(true);
                        }
                      }}
                    >
                      +{remainingCount} more checks
                    </button>
                  </li>
                ) : null}
              </>
            );
          })()}
        </ul>
      </article>
    </div>
  );
}
