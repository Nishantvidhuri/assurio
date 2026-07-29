'use client';

import { type HTMLAttributes } from 'react';
import { cn } from '@/shared/lib/utils';
import { useSlidingIndicator } from '@/shared/hooks/use-sliding-indicator';
import chevronLeftIcon from '@/public/assets/icons/chevron-left-medium/Chevron_Left_Medium=24px.svg'
import { SvgIcon } from './svg-icon';

/* ═══════════════════════════════════════════════════════════════════════════
 * RDS Pagination — Figma node 3023:2253
 *
 * Layout: full-width flex row, justify-between
 *   Left  → previous chevron · page number pills · next chevron
 *   Right → "Results Per Page:" label · page-size pills
 *
 * ─── Token mapping ──────────────────────────────────────────────────────
 *   Active pill  → bg-primary (#174ab5), text-white, rounded-[4px] (corner-radius/sm)
 *                  px-2 py-1, min-w-[26px], h-[28px]
 *   Inactive num → text-text-body (#374150), font-medium
 *   Ellipsis     → text-text-subheading (#828d9d), font-medium
 *   Label        → text-text-subheading (#828d9d), font-medium
 *   Gap          → gap-4 (16px = spacing/xl)
 *   Chevron      → size-6 (24px), text-text-body; disabled → opacity-40
 *   Height       → h-[36px] (items flex-aligned to center)
 *
 * ─── Windowed page list algorithm ───────────────────────────────────────
 *   Always shows: page 1, last page, currentPage, currentPage ± 1
 *   Collapses gaps larger than 1 page into "…"
 *   Examples (totalPages = 100):
 *     currentPage=1  → [1, 2, 3, …, 100]
 *     currentPage=50 → [1, …, 49, 50, 51, …, 100]
 *     currentPage=99 → [1, …, 98, 99, 100]
 *
 * @example
 * ```tsx
 * <Pagination
 *   currentPage={page}
 *   totalPages={Math.ceil(total / pageSize)}
 *   onPageChange={setPage}
 *   pageSize={pageSize}
 *   onPageSizeChange={setPageSize}
 * />
 *
 * // Without page-size selector
 * <Pagination
 *   currentPage={page}
 *   totalPages={50}
 *   onPageChange={setPage}
 *   showPageSizeSelector={false}
 * />
 * ```
 * ═══════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                */
/* ─────────────────────────────────────────────────────────────────────── */

/** Builds the array of page numbers (and '...' separators) to render. */
function buildPageList(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages = new Set<number>();

  // Always include first and last
  pages.add(1);
  pages.add(total);

  // Include window around current
  for (let p = Math.max(1, current - 1); p <= Math.min(total, current + 1); p++) {
    pages.add(p);
  }

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result: (number | '...')[] = [];

  for (let i = 0; i < sorted.length; i++) {
    result.push(sorted[i]);
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) {
      result.push('...');
    }
  }

  return result;
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Sub-components                                                         */
/* ─────────────────────────────────────────────────────────────────────── */

interface PillProps {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  'aria-label'?: string;
  pillRef?: (el: HTMLButtonElement | null) => void;
}

function Pill({ active, disabled, onClick, children, 'aria-label': ariaLabel, pillRef }: PillProps) {
  return (
    <button
      ref={pillRef}
      type="button"
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative z-[1] inline-flex items-center justify-center min-w-[26px] h-7 px-2 rounded-[4px]',
        'text-body-md! font-medium leading-[20px] tracking-body-md whitespace-nowrap',
        'transition-colors duration-300 select-none',
        active
          ? 'text-white'
          : disabled
            ? 'text-text-disabled cursor-not-allowed'
            : 'text-text-body hover:bg-neutral-300 cursor-pointer',
      )}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Pagination                                                             */
/* ─────────────────────────────────────────────────────────────────────── */

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export interface PaginationProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Current 1-based page number */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Called when the user selects a page */
  onPageChange: (page: number) => void;
  /** Active page size (must be one of pageSizeOptions) */
  pageSize?: number;
  /** Called when the user selects a different page size */
  onPageSizeChange?: (size: number) => void;
  /** Available page-size options — default [10, 20, 50, 100] */
  pageSizeOptions?: readonly number[];
  /** Show the Results Per Page selector — default true */
  showPageSizeSelector?: boolean;
}

/**
 * RDS Pagination — Figma node 3023:2253.
 *
 * Renders a full-width bar:
 *   left  → windowed page navigator (prev, page pills, next)
 *   right → "Results Per Page" selector (only when showPageSizeSelector=true)
 */
export function Pagination({
  className,
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  showPageSizeSelector = true,
  ...props
}: PaginationProps) {
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;
  const pages = buildPageList(currentPage, totalPages);

  const {
    setContainerRef: setPageContainerRef,
    registerItem: registerPageItem,
    indicator: pageIndicator,
    hasInitialized: hasPageIndicatorInitialized,
    duration: pageIndicatorDuration,
  } = useSlidingIndicator(currentPage);
  const {
    setContainerRef: setSizeContainerRef,
    registerItem: registerSizeItem,
    indicator: sizeIndicator,
    hasInitialized: hasSizeIndicatorInitialized,
    duration: sizeIndicatorDuration,
  } = useSlidingIndicator(pageSize ?? pageSizeOptions[0]);

  return (
    <div
      className={cn(
        'flex h-9 w-full items-center justify-between',
        className,
      )}
      role="navigation"
      aria-label="Pagination"
      {...props}
    >
      {/* ── Left: page navigator ──────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Previous chevron */}
        <button
          type="button"
          aria-label="Previous page"
          disabled={!canPrev}
          onClick={() => canPrev && onPageChange(currentPage - 1)}
          className={cn(
            'flex size-6 items-center justify-center transition-colors',
            canPrev
              ? 'text-text-body hover:text-primary cursor-pointer'
              : 'text-text-disabled opacity-40 cursor-not-allowed',
          )}
        >
          <SvgIcon src={chevronLeftIcon} size={6} alt="Chevron Left" />
        </button>

        {/* Page number pills with sliding indicator */}
        <div ref={setPageContainerRef} className="relative flex items-center gap-1">
          <div
            className={cn(
              'absolute top-0 rounded-[4px] bg-primary',
              hasPageIndicatorInitialized
                ? 'transition-all ease-[cubic-bezier(0.4,0,0.2,1)]'
                : '',
            )}
            style={{
              left: `${pageIndicator.left}px`,
              width: `${pageIndicator.width}px`,
              height: '100%',
              transitionDuration: hasPageIndicatorInitialized
                ? `${pageIndicatorDuration}ms`
                : '0ms',
            }}
          />
          {pages.map((page, idx) =>
            page === '...' ? (
              <span
                key={`ellipsis-${idx}`}
                className="relative z-[1] text-body-md font-medium leading-[20px] tracking-body-md text-text-subheading select-none"
                aria-hidden="true"
              >
                &hellip;
              </span>
            ) : (
              <Pill
                key={page}
                active={page === currentPage}
                pillRef={(el) => registerPageItem(page, el)}
                onClick={() => page !== currentPage && onPageChange(page)}
                aria-label={`Page ${page}`}
              >
                {page}
              </Pill>
            ),
          )}
        </div>

        {/* Next chevron (ChevronLeft rotated 180°) */}
        <button
          type="button"
          aria-label="Next page"
          disabled={!canNext}
          onClick={() => canNext && onPageChange(currentPage + 1)}
          className={cn(
            'flex size-6 items-center justify-center rotate-180 transition-colors',
            canNext
              ? 'text-text-body hover:text-primary cursor-pointer'
              : 'text-text-disabled opacity-40 cursor-not-allowed',
          )}
        >
          <SvgIcon src={chevronLeftIcon} size={6} alt="Chevron Left" />
        </button>
      </div>

      {/* ── Right: Results Per Page ────────────────────────────────── */}
      {showPageSizeSelector && onPageSizeChange && (
        <div className="flex items-center gap-3" aria-label="Results per page">
          <span className="text-body-md font-medium leading-[20px] tracking-body-md text-text-subheading whitespace-nowrap">
            Results Per Page:
          </span>
          <div ref={setSizeContainerRef} className="relative flex items-center gap-1">
            <div
              className={cn(
                'absolute top-0 rounded-[4px] bg-primary',
                hasSizeIndicatorInitialized
                  ? 'transition-all ease-[cubic-bezier(0.4,0,0.2,1)]'
                  : '',
              )}
              style={{
                left: `${sizeIndicator.left}px`,
                width: `${sizeIndicator.width}px`,
                height: '100%',
                transitionDuration: hasSizeIndicatorInitialized
                  ? `${sizeIndicatorDuration}ms`
                  : '0ms',
              }}
            />
            {pageSizeOptions.map((size) => (
              <Pill
                key={size}
                active={size === pageSize}
                pillRef={(el) => registerSizeItem(size, el)}
                onClick={() => size !== pageSize && onPageSizeChange(size)}
                aria-label={`${size} per page`}
              >
                {size}
              </Pill>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
