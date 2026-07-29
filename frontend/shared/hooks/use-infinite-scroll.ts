'use client';

import { useCallback, useEffect, type RefObject } from 'react';

interface UseInfiniteScrollArgs {
  /**
   * The scrollable container element. Hook attaches its `scroll`
   * listener here AND uses it as the IntersectionObserver root.
   */
  containerRef: RefObject<HTMLElement | null>;
  /**
   * Optional sentinel element rendered near the bottom of the list.
   * When this element scrolls into view (≥ 20% visible), the hook
   * fires `onLoadMore` — covers the case where the list is short
   * enough that the user can't trigger the bottom-threshold check by
   * scrolling.
   */
  sentinelRef?: RefObject<HTMLElement | null>;
  /** When false the hook stops calling `onLoadMore`. */
  hasMore: boolean;
  /**
   * When true the hook stops calling `onLoadMore`. The caller toggles
   * this around its async fetch to prevent re-entrancy.
   */
  isLoading: boolean;
  /** Called whenever the container is within `thresholdPx` of bottom. */
  onLoadMore: () => void;
  /**
   * Distance from the bottom (in px) at which `onLoadMore` fires.
   * Defaults to 24 — matches the value used by the notifications
   * dropdown so the two infinite lists feel consistent.
   */
  thresholdPx?: number;
}

/**
 * Generic "load more when the container scrolls near its bottom" hook.
 *
 * Two trigger sources, both feeding the same load-more callback:
 *   1. `scroll` listener on the container — fires on every scroll
 *      event, checks `scrollHeight − scrollTop − clientHeight ≤ threshold`.
 *      Re-entrancy is prevented by the caller's `isLoading` flag.
 *   2. `IntersectionObserver` on the sentinel element. Catches the
 *      edge case where the initial list is shorter than the viewport,
 *      so the user can't scroll to trigger the bottom check.
 *
 * Both gate on `hasMore && !isLoading`.
 *
 * Mirrors the inline pattern used by
 * modules/notifications/components/notification-bell.tsx — extracted
 * so other features (Verification Schedule columns, future paginated
 * lists) can reuse the same throttled behaviour.
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const sentinelRef = useRef<HTMLDivElement>(null);
 *
 * useInfiniteScroll({
 *   containerRef,
 *   sentinelRef,
 *   hasMore: nextOffset !== null,
 *   isLoading: isLoadingMore,
 *   onLoadMore: () => void loadMore(),
 * });
 *
 * return (
 *   <div ref={containerRef} className="overflow-y-auto">
 *     {items.map(...)}
 *     <div ref={sentinelRef} aria-hidden />
 *   </div>
 * );
 * ```
 */
export function useInfiniteScroll({
  containerRef,
  sentinelRef,
  hasMore,
  isLoading,
  onLoadMore,
  thresholdPx = 24,
}: UseInfiniteScrollArgs): void {
  const maybeLoadMore = useCallback(() => {
    if (!hasMore || isLoading) return;
    const el = containerRef.current;
    if (!el) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining <= thresholdPx) {
      onLoadMore();
    }
  }, [containerRef, hasMore, isLoading, onLoadMore, thresholdPx]);

  // Scroll-listener path: fires every time the user moves the scrollbar.
  // The `isLoading` gate inside `maybeLoadMore` keeps repeated events
  // during a single fetch idempotent.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', maybeLoadMore, { passive: true });
    return () => el.removeEventListener('scroll', maybeLoadMore);
  }, [containerRef, maybeLoadMore]);

  // IntersectionObserver path: rescues the short-list case where the
  // container never reaches a scrollable height. Disconnected when
  // `hasMore` flips false or refs aren't ready.
  useEffect(() => {
    if (!hasMore || !sentinelRef?.current || !containerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          maybeLoadMore();
        }
      },
      { root: containerRef.current, threshold: 0.2 },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [containerRef, sentinelRef, hasMore, maybeLoadMore]);

  // Re-check after every batch lands, so back-to-back pages can chain
  // when the user is still near the bottom.
  useEffect(() => {
    const frameId = window.requestAnimationFrame(maybeLoadMore);
    return () => window.cancelAnimationFrame(frameId);
  }, [maybeLoadMore]);
}
