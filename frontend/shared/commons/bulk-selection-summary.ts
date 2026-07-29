'use client';

import type { BulkSelectionMode } from './bulk-selection.types';

interface BulkSelectionSummaryStateParams {
  selectionMode: BulkSelectionMode;
  explicitSelectedCount: number;
  excludedCount: number;
  eligibleTotal: number;
  totalPages: number;
}

export interface BulkSelectionSummaryState {
  selectedCount: number;
  isAllMatchingState: boolean;
  summaryText: string | null;
}

export function getBulkSelectionSummaryState({
  selectionMode,
  explicitSelectedCount,
  excludedCount,
  eligibleTotal,
  totalPages,
}: BulkSelectionSummaryStateParams): BulkSelectionSummaryState {
  const selectedCount =
    selectionMode === 'ALL_MATCHING'
      ? Math.max(0, eligibleTotal - excludedCount)
      : explicitSelectedCount;

  const isAllMatchingState =
    eligibleTotal > 0 &&
    (selectionMode === 'ALL_MATCHING' || selectedCount === eligibleTotal);

  const summaryText =
    selectedCount === 0
      ? null
      : isAllMatchingState && selectedCount === eligibleTotal
        ? totalPages > 1
          ? `All ${eligibleTotal} selected across all pages`
          : `All ${eligibleTotal} selected`
        : `${selectedCount} of ${eligibleTotal} selected`;

  return {
    selectedCount,
    isAllMatchingState,
    summaryText,
  };
}
