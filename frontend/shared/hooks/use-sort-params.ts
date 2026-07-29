'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export type SortOrder = 'asc' | 'desc' | null;

export interface UseSortParamsReturn {
  sortBy: string | null;
  sortOrder: SortOrder;
  toggleSort: (field: string) => void;
  getSortOrder: (field: string) => SortOrder;
}

/**
 * Reads `sortBy` and `sortOrder` from URL search params and provides
 * a `toggleSort(field)` that cycles `asc -> desc -> clear`.
 *
 * Reusable across any table page that uses URL-driven sorting.
 */
export function useSortParams(): UseSortParamsReturn {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sortBy = searchParams.get('sortBy');
  const rawOrder = searchParams.get('sortOrder');
  const sortOrder: SortOrder =
    rawOrder === 'asc' || rawOrder === 'desc' ? rawOrder : null;

  const toggleSort = useCallback(
    (field: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (sortBy === field) {
        if (sortOrder === 'asc') {
          params.set('sortBy', field);
          params.set('sortOrder', 'desc');
        } else {
          params.delete('sortBy');
          params.delete('sortOrder');
        }
      } else {
        params.set('sortBy', field);
        params.set('sortOrder', 'asc');
      }

      params.set('page', '1');
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams, sortBy, sortOrder],
  );

  const getSortOrder = useCallback(
    (field: string): SortOrder => (sortBy === field ? sortOrder : null),
    [sortBy, sortOrder],
  );

  return { sortBy, sortOrder, toggleSort, getSortOrder };
}
