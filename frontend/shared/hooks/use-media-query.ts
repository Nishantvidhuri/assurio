'use client';

import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query and re-render when its match state flips.
 *
 * Use this whenever the *JSX structure itself* differs between breakpoints
 * (different containers, portals, components). For class-only swaps prefer
 * Tailwind responsive utilities — `useMediaQuery` is a JS-level escape hatch.
 *
 * Initial state is `false` so SSR renders the desktop branch; the effect
 * corrects it on mount and the `change` listener keeps it live on resize.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia(query);
    const sync = () => setMatches(mediaQuery.matches);

    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, [query]);

  return matches;
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Breakpoint helpers                                                     */
/*                                                                         */
/*  Project breakpoints (kept in sync with Tailwind):                      */
/*    Mobile  : ≤ 767px                                                    */
/*    Tablet  : 768 – 1024px                                               */
/*    Desktop : ≥ 1025px                                                   */
/* ─────────────────────────────────────────────────────────────────────── */

/** True on mobile viewports only (≤ 767px). */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}

/**
 * True on mobile AND tablet viewports (≤ 1024px). Use when the mobile
 * layout should also apply to tablet (e.g. hamburger drawer, full-screen
 * notification overlay).
 */
export function useIsMobileOrTablet(): boolean {
  return useMediaQuery('(max-width: 1100px)');
}
