'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  getSortKey,
  type ResolvedColumn,
} from '@/shared/commons/table-column-registry';

/**
 * Watches the URL-driven `sortBy` against the resolved column layout. If the
 * user has hidden whichever column they were sorting by, we silently reset to
 * the table's registered default sort field (or clear sort altogether). Uses
 * `router.replace` so we don't leave a broken sort state in browser history.
 */
export function useResolvedSort(
  columns: ResolvedColumn[],
  defaultSortField: string | undefined,
) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastFixedRef = useRef<string | null>(null);

  useEffect(() => {
    const sortBy = searchParams.get('sortBy');
    if (!sortBy) return;

    const activeColumn = columns.find(
      (c) => getSortKey(c) === sortBy && c.visible,
    );
    if (activeColumn) return;

    // Avoid a tight loop if the replace below races with another effect.
    if (lastFixedRef.current === sortBy) return;
    lastFixedRef.current = sortBy;

    const params = new URLSearchParams(searchParams.toString());
    if (defaultSortField) {
      params.set('sortBy', defaultSortField);
      params.set('sortOrder', 'desc');
    } else {
      params.delete('sortBy');
      params.delete('sortOrder');
    }
    params.set('page', '1');
    router.replace(`?${params.toString()}`);
  }, [columns, defaultSortField, router, searchParams]);
}
