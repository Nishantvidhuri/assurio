'use client';

export type BulkSelectionMode = 'EXPLICIT' | 'ALL_MATCHING';

export interface BulkSelectionRequest<TFilters> {
  mode: BulkSelectionMode;
  ids: string[];
  excludedIds: string[];
  filters: TFilters;
}

