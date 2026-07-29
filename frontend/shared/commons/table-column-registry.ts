import type { ReactNode } from 'react';

export interface ResolvedColumn {
  key: string;
  label: string;
  defaultVisible: boolean;
  defaultOrder: number;
  fixed?: 'leading' | 'trailing';
  sortable?: boolean;
  sortField?: string;
  widthPx?: number;
  /**
   * Mandatory column — the customizer disables both the checkbox and the
   * drag handle so users can't hide or reorder it. Server forces
   * `visible: true` on read regardless of stored prefs, and rejects writes
   * that attempt to hide a locked column.
   */
  lockedVisible?: boolean;
  visible: boolean;
}

export interface ResolvedLayout {
  tableKey: string;
  layoutVersion: number;
  defaultSortField?: string;
  columns: ResolvedColumn[];
}

export type TableAudience = 'client' | 'internal';

export type ColumnRendererMap<TRow, TCtx = void> = Record<
  string,
  (row: TRow, ctx: TCtx) => ReactNode
>;

export function getSortKey(column: ResolvedColumn): string {
  return column.sortField ?? column.key;
}
