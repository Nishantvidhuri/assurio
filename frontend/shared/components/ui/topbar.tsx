/* eslint-disable @next/next/no-img-element */
'use client';

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { useEffectEvent } from '@/shared/hooks/use-effect-event-compat';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ChevronDown, Menu, Search } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Divider } from './divider';
import { MenuItem } from './menu-item';
import { SearchBar } from './search-bar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover';
import { Tooltip } from './tooltip';
import type { TooltipProps } from './tooltip';
import { useAuthSession } from '@/modules/auth/commons/auth-session.context';
import { getInitials } from '@/shared/utils/name-helpers';

// Subtext formatting is provided by the backend (global-search) so this component
// only needs to render the provided copy.
/* ═══════════════════════════════════════════════════════════════════════════
 * RDS TopBar — Figma nodes 3265:3489 (Default) & 3265:3488 (Active/dropdown).
 *
 * Token mapping:
 *   Bar: h-[52px], bg-neutral-200 (#f9fbff), w-full
 *   Padding: px-5 (20px = spacing/2xl), py-2 (8px = spacing/m)
 *   Layout: flex, justify-between, items-center
 *   Right section gap: gap-3 (12px)
 *
 *   Search bar:
 *     w-[250px], bg-white, border-border-default, rounded-md, p-2, gap-1
 *     Icon: Search 16px, text-icon-muted
 *     Placeholder: text-body-md font-normal text-text-disabled
 *
 *   Profile pill:
 *     bg-surface-page (white), border-border-default, rounded-full, px-1 py-[6px], gap-1
 *     Avatar: 24px circle, rounded-full
 *     Name: text-body-sm font-medium text-text-heading tracking-body-sm
 *     ChevronDown: 16px
 *
 *   Profile dropdown (active):
 *     bg-white, border: neutral-300 (#f3f4f7), rounded-md
 *     shadow: 0px 1px 5px rgba(11,26,59,0.06)
 *     py-1 (4px = spacing/s)
 *     Menu item: px-1 py-0.5 wrapper → content p-2 gap-2
 *     Item text: text-body-md font-medium text-text-body
 *     Destructive item (Logout): text-failure
 *
 * @example
 * ```tsx
 * <TopBar
 *   breadcrumbs={<Breadcrumbs><BreadcrumbItem active>Home</BreadcrumbItem></Breadcrumbs>}
 *   avatarUrl="/avatar.jpg"
 *   userName="Alex Johnson"
 *   profileMenuItems={[
 *     { label: 'hr@client.com', icon: <Copy />, onAction: () => copyEmail() },
 *     { label: 'Users', icon: <Users />, href: '/users' },
 *     { label: 'Settings', icon: <Settings />, href: '/settings' },
 *     { label: 'Refer & Earn', icon: <Gift />, href: '/refer' },
 *     { label: 'Logout', icon: <LogOut />, onAction: () => logout(), destructive: true },
 *   ]}
 * />
 * ```
 * ═══════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────── */
/*  Types                                                                  */
/* ─────────────────────────────────────────────────────────────────────── */

export interface ProfileMenuItem {
  label: string;
  icon?: ReactNode;
  href?: string;
  onAction?: () => void;
  /** Renders text in failure color (for Logout) */
  destructive?: boolean;
  /** Renders a divider line after this item */
  separatorAfter?: boolean;
  /** Place icon after the label instead of before (e.g. copy icon on email row) */
  iconEnd?: boolean;
  /** Optional tooltip shown when hovering the icon. */
  iconTooltipText?: string;
  /** Optional tooltip position for the icon tooltip. */
  iconTooltipPosition?: TooltipProps['position'];
  /**
   * Consecutive items sharing the same `groupId` are wrapped together in a
   * single `<div data-tour="profile-group-{groupId}">`, so external code can
   * target the visible region as a unit (e.g. the product tour highlight).
   * Items without a `groupId` render flat as before.
   */
  groupId?: string;
}

export interface TopBarProps extends HTMLAttributes<HTMLElement> {
  /** Left slot — typically Breadcrumbs */
  breadcrumbs?: ReactNode;
  /** Search placeholder text */
  searchPlaceholder?: string;
  /** Called when search value changes */
  onSearchChange?: (value: string) => void;
  /** Called when user submits search (Enter key) */
  onSearchSubmit?: (value: string) => void;
  /** Controlled search input value */
  searchValue?: string;
  /** Enable the built-in animated placeholder suggestions */
  enableAnimatedSearchSuggestions?: boolean;
  /** Which built-in suggestion set to animate */
  animatedSearchSuggestionsPreset?: 'client' | 'client-postpaid' | 'internal';
  /** True while the global search request is in flight */
  searchLoading?: boolean;
  /** True when the last search completed with no routable hits (e.g. no matching candidates) */
  searchNoResults?: boolean;
  /** Grouped search results for dropdown rendering */
  searchResults?: Array<{
    pageName: string;
    route: string;
    searchedText: string;
    subtext?: string;
  }>;
  /** Called when a dropdown result is selected */
  onSearchResultSelect?: (route: string, searchedText: string) => void;
  /** Show the search bar */
  showSearch?: boolean;
  /** User avatar URL */
  avatarUrl?: string;
  /** User display name (truncated with ellipsis) */
  userName?: string;
  /** Items in the profile dropdown */
  profileMenuItems?: ProfileMenuItem[];
  /** Optional bell/dropdown slot rendered before the profile menu */
  notificationSlot?: ReactNode;
  /** Optional slot rendered between the notification bell and the profile menu (e.g. credits balance pill) */
  creditsSlot?: ReactNode;
  /** Optional slot rendered to the LEFT of the desktop search bar (e.g. the super-admin "hide test data" toggle) */
  searchLeadingSlot?: ReactNode;
  /** Called when the mobile hamburger menu button is tapped */
  onMenuClick?: () => void;
  /** Link target for the mobile RecriAuth logo */
  logoHref?: string;
  showDesktopLogo?: boolean;
}

function getIconTooltipContainerClass(
  position: TooltipProps['position'] = 'top-center',
): string {
  switch (position) {
    case 'bottom-left':
      return 'absolute top-full left-0 z-50 mt-2';
    case 'bottom-center':
      return 'absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2';
    case 'bottom-right':
      return 'absolute top-full right-0 z-50 mt-2';
    case 'top-left':
      return 'absolute bottom-full left-0 z-50 mb-2';
    case 'top-right':
      return 'absolute bottom-full right-0 z-50 mb-2';
    case 'left':
      return 'absolute right-full top-1/2 z-50 mr-2 -translate-y-1/2';
    case 'right':
      return 'absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2';
    case 'top-center':
    default:
      return 'absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2';
  }
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  TopBar                                                                 */
/* ─────────────────────────────────────────────────────────────────────── */

const TopBar = forwardRef<HTMLElement, TopBarProps>(
  (
    {
      className,
      breadcrumbs,
      searchPlaceholder = 'Search',
      onSearchChange,
      onSearchSubmit,
      searchValue = '',
      enableAnimatedSearchSuggestions = false,
      animatedSearchSuggestionsPreset = 'client',
      searchLoading = false,
      searchNoResults = false,
      searchResults = [],
      onSearchResultSelect,
      showSearch = true,
      avatarUrl,
      userName,
      profileMenuItems = [],
      notificationSlot,
      creditsSlot,
      searchLeadingSlot,
      onMenuClick,
      logoHref = '/dashboard',
      showDesktopLogo = false,
      ...props
    },
    ref,
  ) => {
    const [profileOpen, setProfileOpen] = useState(false);
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
    const mobileSearchContainerRef = useRef<HTMLDivElement | null>(null);

    const { user } = useAuthSession();

    // External controllers (currently the product tour) drive the profile
    // dropdown via window events. We use these instead of `trigger.click()`
    // because Radix's controlled-state lifecycle isn't safe to poke
    // synchronously from outside React.
    useEffect(() => {
      const open = () => setProfileOpen(true);
      const close = () => setProfileOpen(false);
      window.addEventListener('profile-menu:open', open);
      window.addEventListener('profile-menu:close', close);
      return () => {
        window.removeEventListener('profile-menu:open', open);
        window.removeEventListener('profile-menu:close', close);
      };
    }, []);
    const [hoveredResultIdx, setHoveredResultIdx] = useState<number | null>(null);
    const [dismissedSearchValue, setDismissedSearchValue] = useState<string | null>(
      null,
    );
    const searchContainerRef = useRef<HTMLDivElement | null>(null);
    const searchDismissed =
      dismissedSearchValue !== null &&
      dismissedSearchValue === searchValue &&
      searchValue.trim().length > 0;
    const dismissCurrentSearch = useEffectEvent(() => {
      setDismissedSearchValue(searchValue);
    });

    useEffect(() => {
      const handlePointerDownOutside = (event: MouseEvent) => {
        const target = event.target as Node | null;
        if (!target) return;
        if (searchContainerRef.current?.contains(target)) return;
        if (mobileSearchContainerRef.current?.contains(target)) return;
        dismissCurrentSearch();
      };

      document.addEventListener('mousedown', handlePointerDownOutside);
      return () => {
        document.removeEventListener('mousedown', handlePointerDownOutside);
      };
    }, []);

    const shouldShowSearchResults =
      searchValue.trim().length > 0 &&
      !searchDismissed &&
      (searchLoading || searchNoResults || searchResults.length > 0);

    const searchResultsPanel = (
      <div className="w-full overflow-hidden rounded-md border border-neutral-300 bg-white shadow-[0px_1px_5px_0px_rgba(11,26,59,0.06)]">
        <div className="max-h-[312px] w-full overflow-y-auto overflow-x-hidden">
          <div className="py-1">
            {searchLoading ? (
              <div className="px-[10px] py-[8px] text-body-md font-medium text-text-subheading">
                Searching…
              </div>
            ) : searchNoResults ? (
              <div className="px-[10px] py-[8px] text-body-md font-medium text-text-subheading">
                No search found
              </div>
            ) : (
              searchResults.map((result, idx) => (
                <div
                  key={`${result.route}-${idx}`}
                  className="rounded-sm"
                  onMouseEnter={() => setHoveredResultIdx(idx)}
                  onMouseLeave={() => setHoveredResultIdx(null)}
                >
                  <div className="w-full px-[10px] py-[8px]">
                    <p
                      className="font-semibold text-text-subheading"
                      style={{
                        fontSize: 'var(--text-caption)',
                        lineHeight: 'var(--text-caption--line-height)',
                        letterSpacing: 'var(--tracking-caption)',
                      }}
                    >
                      {result.pageName}
                    </p>
                  </div>
                  <MenuItem
                    state={hoveredResultIdx === idx ? 'On Hover' : 'Default'}
                    menuText={result.searchedText}
                    showSubtext
                    subtext={result.subtext ?? result.route}
                    className="px-0 py-0 gap-0"
                    subtextClassName=""
                    subtextStyle={{
                      fontSize: 'var(--text-caption)',
                      lineHeight: 'var(--text-caption--line-height)',
                      letterSpacing: 'var(--tracking-caption)',
                    }}
                    buttonClassName="px-[10px] py-[8px]"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSearchResultSelect?.(result.route, result.searchedText);
                      onSearchChange?.('');
                    }}
                  />
                  {idx < searchResults.length - 1 && (
                    <div className="px-2 ">
                      <Divider orientation="Horizontal" emphasis="Low" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );

    return (
      <header
        ref={ref}
        className={cn(
          "relative flex h-[52px] items-center justify-between w-full",
          "bg-surface-shell px-5 py-2",
          className,
        )}
        {...props}
      >
        {/* ── Left: Logo (optional) + Breadcrumbs (desktop) ───────── */}
        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          {showDesktopLogo ? (
            <Link
              href={logoHref}
              aria-label="Go to dashboard"
              className="inline-flex items-center"
            >
              <span className="flex items-center gap-2">
                <Image
                  src="/logo-mark.png"
                  alt="Recrify"
                  width={24}
                  height={24}
                  priority
                />
                <span className="font-[family-name:var(--font-logo)] text-[17px] leading-none text-text-heading">
                  Recrify
                </span>
              </span>
            </Link>
          ) : null}
          {breadcrumbs}
        </div>

        {/* ── Left: Hamburger + logo (mobile + tablet) ──────────────
            The hamburger only renders when an `onMenuClick` handler is
            supplied — roles without a sidebar (e.g. candidate) omit it. */}
        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          {onMenuClick ? (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="Open menu"
              className="inline-flex size-8 items-center justify-center rounded-full border border-border-default bg-white transition-colors text-icon-default"
            >
              <Menu className="size-5" aria-hidden />
            </button>
          ) : null}
          <Link
            href={logoHref}
            aria-label="Go to dashboard"
            className="inline-flex items-center"
          >
            <span className="flex items-center gap-2">
              <Image
                src="/logo-mark.png"
                alt="Recrify"
                width={24}
                height={24}
                priority
              />
              <span className="font-[family-name:var(--font-logo)] text-[17px] leading-none text-text-heading">
                Recrify
              </span>
            </span>
          </Link>
        </div>

        {/* ── Right: Search + Profile ────────────────────────────── */}
        <div className="flex items-center gap-3">
          {/* Leading slot (desktop) — e.g. super-admin "hide test data" toggle,
              rendered to the left of the search bar. */}
          {searchLeadingSlot ? (
            <div className="hidden items-center lg:flex">{searchLeadingSlot}</div>
          ) : null}

          {/* Search bar — desktop only */}
          {showSearch && (
            <div
              className="relative hidden w-[350px] lg:block"
              ref={searchContainerRef}
            >
              <SearchBar
                value={searchValue}
                onChange={(v) => onSearchChange?.(v)}
                onClear={() => onSearchChange?.("")}
                placeholder={searchPlaceholder}
                enableAnimatedSuggestions={enableAnimatedSearchSuggestions}
                animatedSuggestionsPreset={animatedSearchSuggestionsPreset}
                className="w-full"
                suggestions={[]}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onSearchSubmit?.(
                      (e.currentTarget as HTMLInputElement).value,
                    );
                  }
                }}
                containerClassName="!w-full"
              />

              {shouldShowSearchResults && (
                <div className="absolute top-full left-0 z-50 mt-1 w-full">
                  {searchResultsPanel}
                </div>
              )}
            </div>
          )}

          {/* Search icon — mobile + tablet only. Toggles a full-width
              search row that drops below the topbar. */}
          {showSearch && (
            <button
              type="button"
              onClick={() => setMobileSearchOpen((open) => !open)}
              aria-label="Search"
              aria-expanded={mobileSearchOpen}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-full border border-border-default bg-white transition-colors hover:bg-neutral-200 text-icon-default lg:hidden",
                mobileSearchOpen && "bg-neutral-300",
              )}
            >
              <Search className="size-5" aria-hidden />
            </button>
          )}

          {creditsSlot}

          {notificationSlot}

          {/* Profile pill + dropdown */}
          <Popover open={profileOpen} onOpenChange={setProfileOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                data-tour="profile-trigger"
                className={cn(
                  "flex items-center gap-1 shrink-0",
                  "bg-surface-page border border-border-default rounded-full",
                  "px-1 py-[6px]",
                  "transition-colors hover:bg-neutral-300",
                )}
              >
                <div className="flex items-center gap-1">
                  {/* Avatar — initials fallback for every user type */}
                  <div className="shrink-0 size-6 overflow-hidden rounded-full bg-primary">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={userName ?? "Avatar"}
                        className="size-full object-cover rounded-full"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-[10px] font-bold uppercase leading-none text-white">
                        {getInitials(userName ?? "User")}
                      </div>
                    )}
                  </div>

                  {/* Name */}
                  {userName && (
                    <span className="max-w-[67px] truncate text-body-sm font-medium leading-[20px] tracking-body-sm text-text-heading hidden md:block">
                      {userName}
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    "inline-flex items-center justify-center transition-transform duration-400",
                    profileOpen && "rotate-180",
                  )}
                >
                  <ChevronDown className="size-4" aria-hidden />
                </span>
              </button>
            </PopoverTrigger>

            <PopoverContent
              align="end"
              sideOffset={4}
              data-tour="profile-menu"
              // While the product tour is driving this popover, suppress
              // Radix's auto-close on outside-click / focus-shift. Without
              // this, the same click that advances the tour to step 6 is
              // caught as "outside" and slams the menu shut a frame later.
              onPointerDownOutside={(event) => {
                if (
                  document.documentElement.dataset.onboardingActive === "true"
                ) {
                  event.preventDefault();
                }
              }}
              onFocusOutside={(event) => {
                if (
                  document.documentElement.dataset.onboardingActive === "true"
                ) {
                  event.preventDefault();
                }
              }}
              onInteractOutside={(event) => {
                if (
                  document.documentElement.dataset.onboardingActive === "true"
                ) {
                  event.preventDefault();
                }
              }}
              className={cn(
                "w-auto min-w-[180px] p-0",
                "bg-white border border-neutral-300 rounded-md",
                "shadow-[0px_1px_5px_0px_rgba(11,26,59,0.06)]",
                "data-[state=open]:animate-[menuSlideIn_400ms_ease-out]",
                "data-[state=closed]:animate-[menuSlideOut_300ms_ease-in]",
              )}
            >
              <div className="py-1 flex flex-col gap-1">
                {(() => {
                  // Render items into a flat array, then post-pass to wrap
                  // adjacent items that share a `groupId` in a single div.
                  // Keeps the existing per-item markup untouched.
                  const renderItem = (item: ProfileMenuItem, idx: number) => {
                    const itemClasses = cn(
                      "flex items-center w-full px-4 py-2 rounded",
                      "text-sm font-medium leading-[20px] tracking-body-md",
                      "transition-colors hover:bg-primary-bg cursor-pointer",
                      item.destructive ? "text-failure" : "text-text-body",
                    );

                    const iconEl = item.icon && (
                      <span className="group/profile-menu-icon relative inline-flex shrink-0 size-4 [&>svg]:size-4">
                        {item.icon}
                        {item.iconTooltipText ? (
                          <span
                            className={cn(
                              "pointer-events-none opacity-0 transition-opacity duration-150 group-hover/profile-menu-icon:opacity-100",
                              getIconTooltipContainerClass(
                                item.iconTooltipPosition,
                              ),
                            )}
                          >
                            <Tooltip
                              variant="basic"
                              position={
                                item.iconTooltipPosition ?? "top-center"
                              }
                              text={item.iconTooltipText}
                            />
                          </span>
                        ) : null}
                      </span>
                    );

                    const content = item.iconEnd ? (
                      <span className="flex items-center justify-between w-full gap-2 w-50">
                        <span className="min-w-0 truncate">{item.label}</span>
                        {iconEl}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        {iconEl}
                        <span className="min-w-0 truncate">{item.label}</span>
                      </span>
                    );

                    const element = item.href ? (
                      <Link
                        href={item.href}
                        className={itemClasses}
                        onClick={() => setProfileOpen(false)}
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={itemClasses}
                        onClick={() => {
                          item.onAction?.();
                          setProfileOpen(false);
                        }}
                      >
                        {content}
                      </button>
                    );

                    return (
                      <div key={idx}>
                        {element}
                        {item.separatorAfter && (
                          <div className="mx-3 my-1 border-t border-neutral-400" />
                        )}
                      </div>
                    );
                  };

                  const out: ReactNode[] = [];
                  let buffer: { id: string; nodes: ReactNode[] } | null = null;
                  const flushBuffer = () => {
                    if (!buffer) return;
                    out.push(
                      <div
                        key={`group-${buffer.id}`}
                        data-tour={`profile-group-${buffer.id}`}
                        className="flex flex-col gap-1"
                      >
                        {buffer.nodes}
                      </div>,
                    );
                    buffer = null;
                  };

                  profileMenuItems.forEach((item, idx) => {
                    const node = renderItem(item, idx);
                    if (item.groupId) {
                      if (buffer && buffer.id === item.groupId) {
                        buffer.nodes.push(node);
                      } else {
                        flushBuffer();
                        buffer = { id: item.groupId, nodes: [node] };
                      }
                    } else {
                      flushBuffer();
                      out.push(node);
                    }
                  });
                  flushBuffer();
                  return out;
                })()}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* ── Mobile + tablet search overlay ──────────────────────────
            A full-screen panel that covers the page when the search icon
            is tapped (same URL — closed via the back arrow). Hidden on
            desktop, which keeps the inline search field instead. */}
        {showSearch && mobileSearchOpen && (
          <div
            ref={mobileSearchContainerRef}
            className="fixed inset-0 z-[60] flex flex-col bg-white lg:hidden"
          >
            <div className="flex shrink-0 items-center gap-3 border-b border-neutral-300 px-5 py-2.5">
              <button
                type="button"
                aria-label="Back"
                onClick={() => setMobileSearchOpen(false)}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border-default bg-white text-icon-default transition-colors hover:bg-neutral-200"
              >
                <ArrowLeft className="size-5" aria-hidden />
              </button>
              <SearchBar
                autoFocus
                value={searchValue}
                onChange={(v) => onSearchChange?.(v)}
                onClear={() => onSearchChange?.("")}
                placeholder={searchPlaceholder}
                enableAnimatedSuggestions={enableAnimatedSearchSuggestions}
                animatedSuggestionsPreset={animatedSearchSuggestionsPreset}
                className="w-full"
                suggestions={[]}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onSearchSubmit?.(
                      (e.currentTarget as HTMLInputElement).value,
                    );
                  }
                }}
                containerClassName="!w-full"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {shouldShowSearchResults ? searchResultsPanel : null}
            </div>
          </div>
        )}
      </header>
    );
  },
);

TopBar.displayName = 'TopBar';

export { TopBar };
