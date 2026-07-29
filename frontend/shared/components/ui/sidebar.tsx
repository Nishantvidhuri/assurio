'use client';

import {
  createContext,
  forwardRef,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/shared/lib/utils';
import barLeft from '@/public/assets/icons/bar-left/Bar_Left=20px.svg';
import { SvgIcon } from './svg-icon';
import closeIcon from '@/public/assets/icons/close-md/Close_MD=20px.svg'

const MIN_EXPANDED_SIDEBAR_WIDTH = 188;

/* ═══════════════════════════════════════════════════════════════════════════
 * RDS Sidebar — Figma nodes 3102:91 (Expanded), 3102:132 (Collapsed),
 *               3102:166 (Collapsed+Hover).
 *
 * Token mapping:
 *   Background: neutral-200 (#f9fbff)
 *   Expanded width: measured from expanded content so the rail grows only
 *   to the longest visible navigation item while still animating smoothly
 *   Collapsed width: auto (icon-only, ~60px)
 *   Min-height: 100vh (full viewport, Figma shows min-h-[1024px])
 *   Gap top ↔ menu: gap-5 (20px = spacing/2xl)
 *
 *   Top (header):
 *     Expanded: px-4 py-[14px], logo + toggle icon (BarLeft 20px), justify-between
 *     Collapsed: px-4 py-[14px], logo icon only, centered
 *     Collapsed+Hover: px-4 py-[14px], toggle icon only, centered
 *
 *   Menu:
 *     Expanded: px-2, gap-px
 *     Collapsed: px-3, gap-px, items-center
 *
 *   Navigation Item (expanded):
 *     p-2 (8px = spacing/m), gap-3 (12px = spacing/l), rounded-md, w-full
 *     Icon: 16px, text-icon-default
 *     Label: text-body-md font-medium leading-[20px] tracking-body-md
 *
 *   Navigation Item (collapsed):
 *     size-9 (36px), p-2, rounded-md, items-center justify-center
 *     Icon only, no label
 *
 *   Active item: bg-[#e6edff], icon + text: text-text-link (#174ab5)
 *   Inactive item: icon + text: text-text-body (#374150)
 *
 * @example
 * ```tsx
 * <Sidebar logo={<Logo />} logoIcon={<LogoIcon />}>
 *   <SidebarItem icon={<Home />} label="Dashboard" href="/" active />
 *   <SidebarItem icon={<Users />} label="Candidates" href="/candidates" />
 *   <SidebarItem icon={<FileText />} label="Invoices" href="/invoices" />
 * </Sidebar>
 * ```
 * ═══════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────── */
/*  Context                                                                */
/* ─────────────────────────────────────────────────────────────────────── */

interface SidebarContextValue {
  expanded: boolean;
  hovering: boolean;
}

const SidebarContext = createContext<SidebarContextValue>({
  expanded: true,
  hovering: false,
});

function useSidebarContext() {
  return useContext(SidebarContext);
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Sidebar                                                                */
/* ─────────────────────────────────────────────────────────────────────── */

export interface SidebarProps extends HTMLAttributes<HTMLElement> {
  /** Full logo element shown in expanded state */
  logo?: ReactNode;
  /** Small icon-only logo shown in collapsed state */
  logoIcon?: ReactNode;
  /** Route opened when the expanded logo is clicked */
  logoHref?: string;
  /** Controlled expanded state */
  expanded?: boolean;
  /** Default expanded state for uncontrolled mode */
  defaultExpanded?: boolean;
  /** Called when the toggle button is clicked */
  onExpandedChange?: (expanded: boolean) => void;
  /**
   * Slot rendered at the bottom of the sidebar, below the navigation menu.
   * Used by client dashboards for the product-feedback widget. Consumers
   * are responsible for visibility (e.g. only render for CLIENT users).
   */
  footer?: ReactNode;
  /**
   * When provided, the sidebar renders in mobile-drawer mode: it is forced
   * expanded, the logo + collapse toggle in the header are replaced by a
   * close (✕) button at the top-left, and clicking it calls this handler.
   */
  onClose?: () => void;
}

const Sidebar = forwardRef<HTMLElement, SidebarProps>(
  (
    {
      className,
      logo,
      logoIcon,
      logoHref = '/dashboard',
      expanded: controlledExpanded,
      defaultExpanded = true,
      onExpandedChange,
      footer,
      onClose,
      children,
      style,
      ...props
    },
    ref,
  ) => {
    const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
    const [hovering, setHovering] = useState(false);
    const [expandedWidth, setExpandedWidth] = useState(228);
    const [hasMeasuredWidth, setHasMeasuredWidth] = useState(false);
    const measureRef = useRef<HTMLDivElement | null>(null);
    // Header ref so mouseEnter on the nav can check whether the pointer
    // entered via the header (which should NOT trigger hover-expand)
    // vs. the menu area below (which should). See onMouseEnter handler.
    const headerRef = useRef<HTMLDivElement | null>(null);

    // In mobile-drawer mode the sidebar is always fully expanded — the
    // collapse affordance is replaced by the close button.
    const expanded = onClose ? true : (controlledExpanded ?? internalExpanded);

    // Tracks whether the CURRENT expanded state was opened by hovering
    // over a collapsed rail (vs. clicking the expand toggle or the
    // parent setting it via `controlledExpanded`). Only hover-opened
    // rails collapse back when the cursor leaves. A user-opened rail
    // stays open even after the cursor moves out.
    // We keep both a ref (for synchronous cross-event reads without a
    // stale-closure race on fast enter/leave sequences) AND a state
    // (so the render can hide the collapse-toggle icon during a
    // hover-owned expansion — the icon should ONLY be visible when
    // the rail is user-owned or collapsed).
    const hoverExpandedRef = useRef(false);
    const [hoverOwned, setHoverOwned] = useState(false);

    const toggle = useCallback(() => {
      // When the rail is currently expanded because of hover, a click
      // on the toggle icon should NOT collapse it — it should "pin"
      // the rail open (convert the ownership from hover to user).
      // Otherwise a user who wants to keep the sidebar open couldn't
      // do it in one gesture; they'd have to leave, click, then aim
      // again. Flipping ownership matches the expected "click to keep
      // it open" affordance.
      if (hoverExpandedRef.current) {
        hoverExpandedRef.current = false;
        setHoverOwned(false);
        // expanded state doesn't change — the parent (controlled
        // mode) or internal state already has it as true.
        return;
      }
      const next = !expanded;
      // Any click when not hover-owned is a plain toggle. Clear the
      // hover flag defensively so nothing else drifts.
      hoverExpandedRef.current = false;
      setHoverOwned(false);
      if (controlledExpanded === undefined) setInternalExpanded(next);
      onExpandedChange?.(next);
    }, [expanded, controlledExpanded, onExpandedChange]);

    // Hover-to-expand: when the rail is collapsed and the pointer
    // enters, open it and mark this expansion as hover-owned so the
    // matching mouse-leave collapses it again. If the rail is already
    // expanded (via click or the parent), this is a no-op — we don't
    // want a hover to "steal" ownership from a user-opened rail.
    const expandOnHover = useCallback(() => {
      if (expanded) return;
      hoverExpandedRef.current = true;
      setHoverOwned(true);
      if (controlledExpanded === undefined) setInternalExpanded(true);
      onExpandedChange?.(true);
    }, [expanded, controlledExpanded, onExpandedChange]);

    // Mouse leaves the rail: collapse only if the current expansion was
    // opened by hover. If the rail is expanded because of a click (or
    // the parent set it), leave it alone.
    const collapseIfHoverOwned = useCallback(() => {
      if (!hoverExpandedRef.current) return;
      hoverExpandedRef.current = false;
      setHoverOwned(false);
      if (controlledExpanded === undefined) setInternalExpanded(false);
      onExpandedChange?.(false);
    }, [controlledExpanded, onExpandedChange]);

    useLayoutEffect(() => {
      const measure = () => {
        const nextWidth = measureRef.current?.offsetWidth;
        if (!nextWidth) return;
        const normalizedWidth = Math.max(
          nextWidth,
          MIN_EXPANDED_SIDEBAR_WIDTH,
        );
        setExpandedWidth((currentWidth) =>
          Math.abs(currentWidth - normalizedWidth) < 1
            ? currentWidth
            : normalizedWidth,
        );
        setHasMeasuredWidth(true);
      };

      measure();

      const node = measureRef.current;
      if (!node || typeof ResizeObserver === 'undefined') return;

      const observer = new ResizeObserver(() => {
        measure();
      });

      observer.observe(node);
      return () => observer.disconnect();
    }, [children, logo, logoHref]);

    // Overlay mode: when the rail is expanded because of hover (not a
    // pinned click), the visible sidebar should FLOAT over the page
    // content instead of pushing it right. Achieved by keeping the
    // <nav> ALWAYS absolutely positioned inside a layout wrapper — the
    // wrapper reserves the "in-flow" slot (48px rail vs. full pinned
    // width) and the nav floats at its display width on top.
    //
    // Keeping `position` constant across states is what makes the width
    // transition smooth. Toggling position between relative <-> absolute
    // mid-transition forces a reflow that visibly abandons the animation.
    const pinned = expanded && !hoverOwned;
    const overlaying = expanded && hoverOwned;
    const displayWidth = expanded
      ? hasMeasuredWidth
        ? `${expandedWidth}px`
        : 'max-content'
      : '48px';
    const layoutWidth = pinned ? displayWidth : '48px';

    return (
      <SidebarContext.Provider value={{ expanded, hovering }}>
        <div
          className={cn(
            'relative shrink-0',
            hasMeasuredWidth && 'transition-[width] duration-300 ease-in-out',
          )}
          style={{ width: layoutWidth }}
          onMouseLeave={() => {
            setHovering(false);
            // Only collapses when the current expansion was opened by
            // hover. Click-expanded rails stay put.
            collapseIfHoverOwned();
          }}
          onMouseEnter={() => {
            // Header hover swaps the collapsed-header icon
            // (logo → collapse arrow). Auto-expand is handled by
            // onMouseMove below so it fires both on entry AND when
            // the cursor moves from header into menu — onMouseEnter
            // alone only fires on crossing the nav's outer boundary.
            setHovering(true);
          }}
          onMouseMove={(event) => {
            // Auto-expand while collapsed. Fires whenever the cursor
            // is over the menu region (below the header). No-op once
            // already expanded (expandOnHover checks that first).
            //
            // Using MouseMove instead of MouseEnter on a menu wrapper
            // covers the "cursor entered via header, then moved down
            // into the menu" case — MouseEnter on inner children
            // only fires on boundary crossings, which some pointer
            // paths skip; the position check here always fires while
            // the pointer is inside the sidebar.
            if (expanded) return;
            const headerEl = headerRef.current;
            if (!headerEl) return;
            const headerRect = headerEl.getBoundingClientRect();
            if (event.clientY > headerRect.bottom) {
              expandOnHover();
            }
          }}
        >
        <nav
          ref={ref}
          className={cn(
            'flex flex-col gap-5 bg-[#F4F7FC] min-h-screen overflow-hidden',
            // Nav is ALWAYS absolutely positioned inside the wrapper.
            // The wrapper's width decides whether surrounding layout
            // reflows (pinned) or stays put (overlay).
            'absolute left-0 top-0 z-40',
            // Transition both `width` AND `box-shadow` so a hover-open
            // never *simultaneously* toggles a className (shadow) while
            // width is mid-animation — that combo makes Chrome recompute
            // styles halfway through and visibly stutter. Keeping the
            // class constant and animating shadow via CSS transition
            // keeps the whole thing on one smooth GPU pass.
            hasMeasuredWidth &&
              'transition-[width,box-shadow] duration-300 ease-in-out',
            'items-start',
            className,
          )}
          style={{
            ...style,
            width: displayWidth,
            // Shadow expressed as an inline style so the transition
            // interpolates it during hover-open/close. The shadow value
            // resolves to "none" when not overlaying — matches Chrome's
            // native shadow interpolation semantics.
            boxShadow: overlaying
              ? '0 10px 25px -5px rgba(11, 26, 59, 0.15), 0 8px 10px -6px rgba(11, 26, 59, 0.10)'
              : '0 0 0 0 rgba(0, 0, 0, 0)',
            willChange: 'width, box-shadow',
          }}
          {...props}
        >
          {/* ── Header ──────────────────────────────────────────────── */}
          <div
            ref={headerRef}
            className={cn(
              'flex items-center shrink-0 w-full h-13 transition-[padding] duration-300 ease-in-out',
              onClose
                ? 'px-4 justify-start'
                : expanded
                  ? 'px-4 justify-between'
                  : 'px-1.5 justify-center',
            )}
          >
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="inline-flex size-8 items-center justify-center rounded-full border border-border-default bg-white text-icon-default transition-colors"
              >
                <SvgIcon src={closeIcon} size={5} alt="Close" />
              </button>
            ) : expanded ? (
              <>
                <Link
                  href={logoHref}
                  aria-label="Go to dashboard"
                  className="inline-flex items-center"
                >
                  {logo ?? (
                    <Image
                      src="/assets/logo/full-logo-powered.svg"
                      alt="RecriAuth"
                      width={100}
                      height={24}
                      priority
                    />
                  )}
                </Link>
                {/* Always visible when expanded — see `toggle` for
                    what a click does: hover-owned → pins (stays
                    open, ownership flips to user); user-owned →
                    collapses. */}
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={hoverOwned ? 'Pin sidebar open' : 'Collapse sidebar'}
                  className="group relative inline-flex size-8 items-center justify-center shrink-0 cursor-pointer"
                >
                  {/* Circle */}
                  <span className="absolute inset-0 rounded-full transition-colors group-hover:bg-primary-200" />

                  {/* Icon */}
                  <SvgIcon
                    src={barLeft}
                    size={5}
                    alt="icon"
                    className="relative z-10 text-icon-default transition-colors group-hover:text-text-body"
                  />
                </button>
              </>
            ) : (
              <div
                className="relative flex size-9 items-center justify-center"
              >
                <div
                  className={cn(
                    'absolute inset-0 flex items-center justify-center',
                    'transition-all duration-200 ease-in-out',
                    hovering
                      ? 'opacity-0 scale-95 pointer-events-none'
                      : 'opacity-100 scale-100',
                  )}
                >
                  {logoIcon ?? (
                    <Image
                      src="/assets/logo/icon-logo.svg"
                      alt="RecriAuth"
                      width={22}
                      height={24}
                      priority
                    />
                  )}
                </div>

                <button
                  type="button"
                  onClick={toggle}
                  aria-label="Expand sidebar"
                  className={cn(
                    'absolute inset-0 flex items-center justify-center',
                    'text-icon-default hover:text-text-body transition-all duration-200 ease-in-out',
                    hovering
                      ? "opacity-100 scale-100 cursor-pointer"
                      : "opacity-0 scale-95 pointer-events-none",
                  )}
                >
                  {/* Circle */}
                  <span className="absolute inset-0 rounded-full transition-colors group-hover:bg-primary-200" />

                  {/* Icon */}
                  <span className="relative z-10 flex items-center justify-center">
                    <SvgIcon
                      src={barLeft}
                      size={5}
                      alt="icon"
                    />
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* ── Menu ────────────────────────────────────────────────── */}
          <SidebarMenu expanded={expanded}>
            {children}
          </SidebarMenu>

          {/* ── Footer slot (e.g. product feedback widget) ─────────── */}
          {footer ? (
            <div className="mt-auto w-full shrink-0">{footer}</div>
          ) : null}

          <SidebarContext.Provider value={{ expanded: true, hovering: false }}>
            <div
              ref={measureRef}
              aria-hidden="true"
              className="pointer-events-none invisible absolute left-0 top-0 w-max"
            >
              <div className="flex flex-col gap-5 bg-neutral-200">
                <div className="flex h-[52px] w-full shrink-0 items-center justify-between px-4">
                  <Link
                    href={logoHref}
                    aria-label="Go to dashboard"
                    className="inline-flex items-center"
                    tabIndex={-1}
                  >
                    {logo ?? (
                      <Image
                        src="/assets/logo/full-logo.svg"
                        alt="RecriAuth"
                        width={100}
                        height={24}
                        priority
                      />
                    )}
                  </Link>
                  <span className="shrink-0 text-icon-default">
                    <SvgIcon src={barLeft} size={5} alt="icon" />
                  </span>
                </div>

                <div className="flex w-full shrink-0 flex-col gap-px px-3">
                  {children}
                </div>
              </div>
            </div>
          </SidebarContext.Provider>
        </nav>
        </div>
      </SidebarContext.Provider>
    );
  },
);

Sidebar.displayName = 'Sidebar';

/* ─────────────────────────────────────────────────────────────────────── */
/*  SidebarMenu (sliding active indicator)                                 */
/* ─────────────────────────────────────────────────────────────────────── */

function SidebarMenu({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState({ top: 0, height: 0 });
  const [hasInit, setHasInit] = useState(false);

  useLayoutEffect(() => {
    const container = menuRef.current;
    if (!container) return;

    const activeEl = container.querySelector('[data-sidebar-active="true"]') as HTMLElement | null;
    if (!activeEl) return;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();

    const newTop = activeRect.top - containerRect.top;
    const newHeight = activeRect.height;

    setIndicator((prev) => {
      if (prev.top === newTop && prev.height === newHeight) return prev;
      return { top: newTop, height: newHeight };
    });

    if (!hasInit) {
      requestAnimationFrame(() => setHasInit(true));
    }
  }, [children, expanded, hasInit]);

  return (
    <div
      ref={menuRef}
      className="relative flex flex-col shrink-0 w-full px-2"
    >
      {/* Sliding active indicator */}
      {indicator.height > 0 && (
        <div
          className={cn(
            'absolute left-1.5 right-1.5 rounded-md bg-[#e6edff] pointer-events-none',
            hasInit && 'transition-all duration-300 ease-in-out',
          )}
          style={{
            top: `${indicator.top}px`,
            height: `${indicator.height}px`,
          }}
        />
      )}
      {/* `data-tour="sidebar-menu"` lives on this inner wrapper instead
       * of the outer `px-2` container so the product-tour highlight
       * cutout traces the actual menu-items area — without the parent's
       * 8 px horizontal padding being counted into the stage rect. The
       * outer div still owns `relative` + the absolute indicator so
       * layout / animation are unchanged. */}
      <div data-tour="sidebar-menu" className="flex flex-col gap-px w-full">
        {children}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  SidebarItem                                                            */
/* ─────────────────────────────────────────────────────────────────────── */

export interface SidebarItemProps extends HTMLAttributes<HTMLElement> {
  /** Icon rendered as 16px lucide-react icon or custom ReactNode */
  icon: ReactNode;
  /** Label text shown in expanded state */
  label: string;
  /** Whether this item is the active route */
  active?: boolean;
  /** Navigation href — renders as <a>; if omitted renders as <button> */
  href?: string;
  /** Click handler */
  onItemClick?: () => void;
}

const SidebarItem = forwardRef<HTMLElement, SidebarItemProps>(
  ({ className, icon, label, active = false, href, onItemClick, ...props }, ref) => {
    const { expanded } = useSidebarContext();

    const baseClasses = cn(
      'relative z-[1] flex items-center rounded-md transition-colors duration-200',
      active
        ? 'text-text-link'
        : 'text-text-body hover:bg-neutral-300',
      'justify-start w-full px-2 py-2 transition-[gap] duration-300 ease-in-out',
      expanded ? 'gap-3' : 'gap-0',
      className,
    );

    const content = (
      <>
        <span className="shrink-0 flex items-center justify-center w-4 h-4 text-inherit [&>svg]:size-4">
          {icon}
        </span>
        <span
          className={cn(
            'text-body-md font-medium leading-[20px] tracking-body-md whitespace-nowrap',
            'overflow-hidden will-change-[max-width,opacity]',
            'transition-[max-width,opacity] duration-300 ease-in-out',
            expanded
              ? 'max-w-[220px] opacity-100'
              : 'max-w-0 opacity-0',
          )}
        >
          {label}
        </span>
      </>
    );

    if (href) {
      return (
        <Link
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          className={baseClasses}
          onClick={onItemClick}
          data-sidebar-active={active}
          {...(props as HTMLAttributes<HTMLAnchorElement>)}
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        className={baseClasses}
        onClick={onItemClick}
        data-sidebar-active={active}
        {...(props as HTMLAttributes<HTMLButtonElement>)}
      >
        {content}
      </button>
    );
  },
);

SidebarItem.displayName = 'SidebarItem';

export { Sidebar, SidebarItem, useSidebarContext };
