'use client';

import { useEffect, useMemo, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { DateRangeValue } from '@/shared/components/ui/filter';

// Mirrors the client dashboard's useDashboardDateRange so the vendor pages get
// the exact same date-filter UX (ISO `dateFrom`/`dateTo` query params, default
// last-30-days, cosmetic URL mirror on first load, router.replace on change).

const DEFAULT_RANGE_DAYS = 30;

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

/** Default range when no dateFrom/dateTo params are present: last 30 days. */
export function getDefaultVendorRange(): DateRangeValue {
  const to = endOfDay(new Date());
  const from = startOfDay(new Date());
  from.setDate(from.getDate() - (DEFAULT_RANGE_DAYS - 1));
  return { from, to };
}

export function readVendorRangeFromSearchParams(
  searchParams: URLSearchParams,
): DateRangeValue {
  const fromParam = searchParams.get('dateFrom');
  const toParam = searchParams.get('dateTo');
  if (!fromParam || !toParam) {
    return getDefaultVendorRange();
  }
  const from = new Date(fromParam);
  const to = new Date(toParam);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return getDefaultVendorRange();
  }
  return { from, to };
}

function hasExplicitValidRange(searchParams: URLSearchParams): boolean {
  const fromParam = searchParams.get('dateFrom');
  const toParam = searchParams.get('dateTo');
  if (!fromParam || !toParam) {
    return false;
  }
  const from = new Date(fromParam);
  const to = new Date(toParam);
  return !isNaN(from.getTime()) && !isNaN(to.getTime());
}

interface UseVendorDateRangeResult {
  range: DateRangeValue;
  setRange: (next: DateRangeValue | null) => void;
  isPending: boolean;
}

export function useVendorDateRange(): UseVendorDateRangeResult {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const range = useMemo(
    () => readVendorRangeFromSearchParams(searchParams),
    [searchParams],
  );
  const hasExplicitRange = useMemo(
    () => hasExplicitValidRange(searchParams),
    [searchParams],
  );

  // When the URL has no explicit range, mirror the resolved default into the
  // address bar via history.replaceState (cosmetic — avoids re-running the
  // server component, which would double-fetch on first paint). The SSR fetch
  // already resolves the same default internally.
  useEffect(() => {
    if (hasExplicitRange || typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('dateFrom', range.from.toISOString());
    params.set('dateTo', range.to.toISOString());
    const nextQuery = params.toString();
    if (nextQuery === searchParams.toString()) {
      return;
    }
    const nextUrl = `${window.location.pathname}?${nextQuery}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [hasExplicitRange, range.from, range.to, searchParams]);

  const setRange = (next: DateRangeValue | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set('dateFrom', next.from.toISOString());
      params.set('dateTo', next.to.toISOString());
    } else {
      params.delete('dateFrom');
      params.delete('dateTo');
    }
    startTransition(() => {
      router.replace(`?${params.toString()}`);
    });
  };

  return { range, setRange, isPending };
}
