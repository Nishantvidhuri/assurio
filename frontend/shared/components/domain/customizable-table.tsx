'use client';

import {
  cloneElement,
  isValidElement,
  type HTMLAttributes,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  TableBody,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@/shared/components/ui';
import { useSortParams } from '@/shared/hooks/use-sort-params';
import { useResolvedSort } from '@/shared/hooks/use-resolved-sort';
import { useTableColumnLayout } from '@/shared/hooks/use-table-column-layout';
import {
  getSortKey,
  type ColumnRendererMap,
  type ResolvedColumn,
  type TableAudience,
} from '@/shared/commons/table-column-registry';
import { cn } from '@/shared/lib/utils';
import { ColumnCustomizer } from './column-customizer';

interface CustomizableTableProps<TRow, TCtx = void> {
  /** API audience prefix (`client` or `internal`). */
  audience: TableAudience;
  /** Server registry key, e.g. `client.candidates`. */
  tableKey: string;
  /** Synchronous fallback layout used until the GET hydrate completes. */
  defaults: ResolvedColumn[];
  data: TRow[];
  renderers: ColumnRendererMap<TRow, TCtx>;
  rowCtx?: (row: TRow) => TCtx;
  rowKey: (row: TRow) => string;
  /** Renders the leading fixed column for each body row (e.g. row checkbox). */
  leadingCell?: (row: TRow) => ReactNode;
  /** Renders the leading fixed column for the header (e.g. select-all). */
  leadingHeader?: () => ReactNode;
  /** Renders the trailing fixed column for each body row (e.g. actions menu). */
  trailingCell?: (row: TRow) => ReactNode;
  /**
   * Renders the trailing fixed column header content. The customizer trigger
   * is appended to the right of whatever this returns.
   */
  trailingHeader?: () => ReactNode;
  /**
   * `whole-table` keeps the entire table as the horizontal scroll container.
   * `center-columns-only` structurally fixes the leading/trailing groups and
   * lets only the inner data columns scroll.
   */
  scrollMode?: 'whole-table' | 'center-columns-only';
  /** Optional empty-state row when `data.length === 0`. */
  emptyState?: ReactNode;
  /**
   * Per-row HTML attributes spread onto the `<tr>` element. Use this for
   * row-level click/keyboard handlers (e.g. navigate-to-detail behavior).
   * Returned `className` is appended to the row's existing classes.
   */
  rowProps?: (row: TRow) => HTMLAttributes<HTMLTableRowElement>;
}

// Soft drop shadow falling away from the sticky column's inner edge so the
// horizontally-scrolled body cells visibly tuck under the fixed columns.
const SHADOW_LEADING = 'shadow-[4px_0_8px_-4px_rgba(11,26,59,0.10)]';
const SHADOW_TRAILING = 'shadow-[-4px_0_8px_-4px_rgba(11,26,59,0.10)]';

function snapshotColumns(columns: ResolvedColumn[]): ResolvedColumn[] {
  return columns.map((c) => ({ ...c }));
}

function buildDefaultsSnapshot(defaults: ResolvedColumn[]): ResolvedColumn[] {
  return [...defaults]
    .sort((a, b) => a.defaultOrder - b.defaultOrder)
    .map((c) => ({ ...c, visible: c.defaultVisible }));
}

// Compare layouts by visibility set + non-fixed key order. Fixed columns are
// not user-controllable so they don't count toward the dirty flag.
function isLayoutDirty(
  pending: ResolvedColumn[],
  saved: ResolvedColumn[],
): boolean {
  const p = pending.filter((c) => !c.fixed);
  const s = saved.filter((c) => !c.fixed);
  if (p.length !== s.length) return true;
  for (let i = 0; i < p.length; i += 1) {
    if (p[i].key !== s[i].key) return true;
    if (p[i].visible !== s[i].visible) return true;
  }
  return false;
}

function serializeColumns(columns: ResolvedColumn[]): {
  hiddenColumnKeys: string[];
  columnOrder: string[];
} {
  const reorderable = columns.filter((c) => !c.fixed);
  return {
    hiddenColumnKeys: reorderable.filter((c) => !c.visible).map((c) => c.key),
    columnOrder: reorderable.map((c) => c.key),
  };
}

export function CustomizableTable<TRow, TCtx = void>({
  audience,
  tableKey,
  defaults,
  data,
  renderers,
  rowCtx,
  rowKey,
  leadingCell,
  leadingHeader,
  trailingCell,
  trailingHeader,
  scrollMode = 'center-columns-only',
  emptyState,
  rowProps,
}: CustomizableTableProps<TRow, TCtx>) {
  const layout = useTableColumnLayout(audience, tableKey, defaults);
  const { columns, defaultSortField, commit } = layout;
  const { toggleSort, getSortOrder } = useSortParams();

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ResolvedColumn[]>(() =>
    snapshotColumns(columns),
  );
  const [saving, setSaving] = useState(false);
  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);
  const [syncedHeaderHeight, setSyncedHeaderHeight] = useState<number | null>(
    null,
  );
  const [syncedRowHeights, setSyncedRowHeights] = useState<number[]>([]);

  // Snapshot saved columns into pending whenever the popover transitions
  // closed→open, so the live preview starts in sync with the saved layout.
  // Wrapping setOpen this way avoids a one-frame flash where pending is stale.
  const onOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setPending(snapshotColumns(columns));
      }
      setOpen(next);
    },
    [columns],
  );

  // While the popover is closed, keep pending in sync with the saved layout
  // (e.g. after a successful Save the hook updates `columns`, and the next
  // open should snapshot from the new saved state).
  useEffect(() => {
    if (!open) {
      setPending(snapshotColumns(columns));
    }
  }, [columns, open]);

  const dirty = useMemo(() => isLayoutDirty(pending, columns), [pending, columns]);

  const handleToggle = useCallback((columnKey: string) => {
    setPending((prev) =>
      prev.map((c) =>
        c.key === columnKey && !c.fixed && !c.lockedVisible
          ? { ...c, visible: !c.visible }
          : c,
      ),
    );
  }, []);

  const handleReorder = useCallback(
    (sourceKey: string, targetKey: string) => {
      if (sourceKey === targetKey) return;
      setPending((prev) => {
        const source = prev.find((c) => c.key === sourceKey);
        const target = prev.find((c) => c.key === targetKey);
        if (!source || !target) return prev;
        // Fixed columns can't be reordered; lockedVisible columns can
        // neither be moved nor become a drop target (so they stay at their
        // declared position relative to other reorderable cols).
        if (source.fixed || target.fixed) return prev;
        if (source.lockedVisible || target.lockedVisible) return prev;

        const reorderable = prev.filter((c) => !c.fixed);
        const fixedLeading = prev.filter((c) => c.fixed === 'leading');
        const fixedTrailing = prev.filter((c) => c.fixed === 'trailing');
        const sIdx = reorderable.findIndex((c) => c.key === sourceKey);
        const tIdx = reorderable.findIndex((c) => c.key === targetKey);
        if (sIdx === -1 || tIdx === -1) return prev;

        const next = reorderable.slice();
        const [moved] = next.splice(sIdx, 1);
        next.splice(tIdx, 0, moved);
        return [...fixedLeading, ...next, ...fixedTrailing];
      });
    },
    [],
  );

  const handleReset = useCallback(() => {
    setPending(buildDefaultsSnapshot(defaults));
  }, [defaults]);

  const handleSave = useCallback(async () => {
    if (!dirty || saving) return;
    const payload = serializeColumns(pending);
    setSaving(true);
    try {
      await commit(payload.hiddenColumnKeys, payload.columnOrder);
      setOpen(false);
    } catch {
      // toast handled by the hook; keep popover open for retry
    } finally {
      setSaving(false);
    }
  }, [commit, dirty, pending, saving]);

  // Live-preview overlay: while the popover is open, the table reflects
  // pending state in real time. When closed, the saved layout is the source
  // of truth.
  const effectiveColumns = open ? pending : columns;
  // Sort logic always reads/writes against the saved layout — we don't want
  // URL flicker on every preview toggle. The reset will fire after Save when
  // the saved layout actually loses the active sort column.
  useResolvedSort(columns, defaultSortField);

  const visibleReorderable = effectiveColumns.filter(
    (c) => !c.fixed && c.visible,
  );
  const fixedLeading = effectiveColumns.find((c) => c.fixed === 'leading');
  const fixedTrailing = effectiveColumns.find((c) => c.fixed === 'trailing');

  // Sticky columns render their inner-edge drop shadows whenever the table
  // overflows the wrapper horizontally — independent of current scroll
  // position. The shadows act as a permanent affordance: "this is a fixed
  // column; the inner area scrolls". Re-measure on every render path that
  // changes the rendered column set: saved state changes (`columns`),
  // live-preview toggles in the customizer (`pending` via `effectiveColumns`),
  // and row count changes.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const centerWrapperRef = useRef<HTMLDivElement>(null);
  const leadingHeaderRowRef = useRef<HTMLTableRowElement | null>(null);
  const centerHeaderRowRef = useRef<HTMLTableRowElement | null>(null);
  const trailingHeaderRowRef = useRef<HTMLTableRowElement | null>(null);
  const leadingBodyRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const centerBodyRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const trailingBodyRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const [hasOverflow, setHasOverflow] = useState(false);
  useEffect(() => {
    const el =
      scrollMode === 'center-columns-only'
        ? centerWrapperRef.current
        : wrapperRef.current;
    if (!el) return;
    const update = () => {
      // 1px tolerance covers sub-pixel rounding when wrapper width equals
      // table width — scrollWidth - clientWidth can drift by ~0.5.
      setHasOverflow(el.scrollWidth - el.clientWidth > 1);
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => {
      ro.disconnect();
    };
  }, [data.length, effectiveColumns, scrollMode]);

  useLayoutEffect(() => {
    if (scrollMode !== 'center-columns-only') {
      setSyncedHeaderHeight(null);
      setSyncedRowHeights([]);
      return;
    }

    const leadingRows = leadingBodyRowRefs.current;
    const centerRows = centerBodyRowRefs.current;
    const trailingRows = trailingBodyRowRefs.current;

    const measure = () => {
      const nextHeaderHeight = Math.max(
        leadingHeaderRowRef.current?.getBoundingClientRect().height ?? 0,
        centerHeaderRowRef.current?.getBoundingClientRect().height ?? 0,
        trailingHeaderRowRef.current?.getBoundingClientRect().height ?? 0,
      );

      setSyncedHeaderHeight((current) => {
        if (current !== null && Math.abs(current - nextHeaderHeight) < 1) {
          return current;
        }
        return nextHeaderHeight > 0 ? nextHeaderHeight : null;
      });

      const nextRowHeights = data.map((_, index) =>
        Math.max(
          leadingRows[index]?.getBoundingClientRect().height ?? 0,
          centerRows[index]?.getBoundingClientRect().height ?? 0,
          trailingRows[index]?.getBoundingClientRect().height ?? 0,
        ),
      );

      setSyncedRowHeights((current) => {
        if (
          current.length === nextRowHeights.length &&
          current.every(
            (height, index) => Math.abs(height - nextRowHeights[index]) < 1,
          )
        ) {
          return current;
        }
        return nextRowHeights;
      });
    };

    const raf = requestAnimationFrame(measure);
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(measure);
    });

    const elements = [
      leadingHeaderRowRef.current,
      centerHeaderRowRef.current,
      trailingHeaderRowRef.current,
      ...leadingRows,
      ...centerRows,
      ...trailingRows,
    ].filter((node): node is HTMLTableRowElement => Boolean(node));

    elements.forEach((element) => observer.observe(element));

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [
    data,
    effectiveColumns,
    scrollMode,
  ]);

  const customizer = (
    <ColumnCustomizer
      open={open}
      onOpenChange={onOpenChange}
      pendingColumns={pending}
      dirty={dirty}
      saving={saving}
      onToggle={handleToggle}
      onReorder={handleReorder}
      onReset={handleReset}
      onSave={handleSave}
    />
  );

  // Order matters: colgroup columns must align 1:1 with the cells we render
  // below, in the same order. <colgroup> is the single source of truth for
  // column width, so cell renderers never need to think about widths.
  const colgroupCols: ResolvedColumn[] = [
    ...(fixedLeading ? [fixedLeading] : []),
    ...visibleReorderable,
    ...(fixedTrailing ? [fixedTrailing] : []),
  ];

  // Sticky groups: contiguous block of fixed + lockedVisible columns at each
  // edge. Fixed cols are sticky by definition; lockedVisible cols join the
  // group when they're adjacent (so they don't scroll either, and the
  // shadow lands on the inner-most edge of the group instead of on the
  // fixed column alone).
  //
  //   stickyMeta.get(key) = {
  //     side: 'leading' | 'trailing',
  //     offsetPx: distance from the wrapper's left/right edge,
  //     isInnermost: true if this is the inner-most sticky cell on its side
  //                  (the only one that gets the drop shadow),
  //     isOutermost: true if this is the outer-most sticky cell on its side
  //                  (the only one that gets the rounded corner),
  //   }
  type StickyMeta = {
    side: 'leading' | 'trailing';
    offsetPx: number;
    isInnermost: boolean;
    isOutermost: boolean;
  };
  const stickyMeta = new Map<string, StickyMeta>();

  const leadingGroup: ResolvedColumn[] = [];
  for (const c of colgroupCols) {
    if (c.fixed === 'leading' || c.lockedVisible) {
      leadingGroup.push(c);
    } else {
      break;
    }
  }
  let leftAcc = 0;
  leadingGroup.forEach((c, i) => {
    stickyMeta.set(c.key, {
      side: 'leading',
      offsetPx: leftAcc,
      isOutermost: i === 0,
      isInnermost: i === leadingGroup.length - 1,
    });
    leftAcc += c.widthPx ?? 0;
  });

  const trailingGroup: ResolvedColumn[] = [];
  for (let j = colgroupCols.length - 1; j >= 0; j -= 1) {
    const c = colgroupCols[j];
    if (c.fixed === 'trailing' || c.lockedVisible) {
      trailingGroup.unshift(c);
    } else {
      break;
    }
  }
  // Walk back-to-front to accumulate from the right edge.
  let rightAcc = 0;
  for (let i = trailingGroup.length - 1; i >= 0; i -= 1) {
    const c = trailingGroup[i];
    // Skip if a column was somehow in both groups (shouldn't happen for
    // valid registries — boot validation enforces structure).
    if (stickyMeta.has(c.key)) continue;
    stickyMeta.set(c.key, {
      side: 'trailing',
      offsetPx: rightAcc,
      isOutermost: i === trailingGroup.length - 1,
      isInnermost: i === 0,
    });
    rightAcc += c.widthPx ?? 0;
  }

  // Sticky cols (fixed + adjacent locked) get pixel widths so cumulative
  // offsets work; remaining flexible cols share the leftover space via
  // percentages (per CSS Tables L3: percentage <col> widths under
  // table-layout: fixed resolve against table-width minus pixel cols).
  const reorderableWeight = visibleReorderable
    .filter((c) => !stickyMeta.has(c.key))
    .reduce((sum, c) => sum + (c.widthPx ?? 100), 0);
  const colWidthFor = (col: ResolvedColumn): string | number | undefined => {
    if (col.widthPx == null) return undefined;
    if (col.fixed || stickyMeta.has(col.key)) return col.widthPx;
    if (reorderableWeight === 0) return undefined;
    return `${((col.widthPx ?? 100) / reorderableWeight) * 100}%`;
  };

  // Min width prevents the table collapsing on narrow viewports — the
  // wrapper's overflow-x-auto then engages and scrolls.
  const minTableWidth = colgroupCols.reduce(
    (sum, c) => sum + (c.widthPx ?? 0),
    0,
  );

  const leadingKeys = new Set(leadingGroup.map((c) => c.key));
  const trailingKeys = new Set(trailingGroup.map((c) => c.key));
  const leadingPaneCols = leadingGroup;
  const trailingPaneCols = trailingGroup;
  const centerPaneCols = colgroupCols.filter(
    (c) => !leadingKeys.has(c.key) && !trailingKeys.has(c.key),
  );
  const leadingPaneWidth = leadingPaneCols.reduce(
    (sum, c) => sum + (c.widthPx ?? 0),
    0,
  );
  const trailingPaneWidth = trailingPaneCols.reduce(
    (sum, c) => sum + (c.widthPx ?? 0),
    0,
  );
  const centerPaneMinWidth = centerPaneCols.reduce(
    (sum, c) => sum + (c.widthPx ?? 0),
    0,
  );
  const centerPaneWeight = centerPaneCols.reduce(
    (sum, c) => sum + (c.widthPx ?? 100),
    0,
  );
  const centerColWidthFor = (col: ResolvedColumn): string | number | undefined => {
    if (col.widthPx == null) return undefined;
    if (centerPaneWeight === 0) return undefined;
    return `${((col.widthPx ?? 100) / centerPaneWeight) * 100}%`;
  };

  const renderHeaderCell = (
    col: ResolvedColumn,
    {
      roundedLeft = false,
      roundedRight = false,
    }: {
      roundedLeft?: boolean;
      roundedRight?: boolean;
    } = {},
  ) => {
    const sortField = getSortKey(col);
    return (
      <TableHeaderCell
        key={col.key}
        type="default"
        label={col.label}
        sortable={col.sortable}
        sortOrder={col.sortable ? getSortOrder(sortField) : null}
        onSort={col.sortable ? () => toggleSort(sortField) : undefined}
        roundedLeft={roundedLeft}
        roundedRight={roundedRight}
      />
    );
  };

  const renderDataCell = (col: ResolvedColumn, row: TRow, ctx: TCtx) => {
    const renderer = renderers[col.key];
    if (!renderer) {
      return (
        <td
          key={col.key}
          className="border-b border-border-default p-3 h-[46px]"
        />
      );
    }
    return <RendererCell key={col.key} node={renderer(row, ctx)} />;
  };

  const getHeaderRowStyle = (): CSSProperties | undefined =>
    syncedHeaderHeight !== null ? { height: syncedHeaderHeight } : undefined;

  const getBodyRowStyle = (rowIndex: number): CSSProperties | undefined => {
    const height = syncedRowHeights[rowIndex];
    return height ? { height } : undefined;
  };

  if (scrollMode === 'center-columns-only') {
    const renderLeadingHeaderCell = (col: ResolvedColumn, index: number) => {
      if (col.fixed === 'leading' && col.key === fixedLeading?.key) {
        return (
          <th
            key={col.key}
            className={cn(
              'bg-neutral-200 h-[46px] p-3 align-middle text-center leading-[0]',
              index === 0 && 'rounded-tl-lg',
            )}
          >
            {leadingHeader?.()}
          </th>
        );
      }

      return renderHeaderCell(col, {
        roundedLeft: index === 0,
      });
    };

    const renderTrailingHeaderCell = (col: ResolvedColumn, index: number) => {
      if (col.fixed === 'trailing' && col.key === fixedTrailing?.key) {
        return (
          <th
            key={col.key}
            className={cn(
              'bg-neutral-200 h-[46px] p-3',
              index === trailingPaneCols.length - 1 && 'rounded-tr-lg',
            )}
          >
            <div
              className={cn(
                'flex items-center gap-1',
                trailingHeader ? 'justify-end' : 'justify-center',
              )}
            >
              {trailingHeader ? (
                <div className="min-w-0 flex-1">{trailingHeader()}</div>
              ) : null}
              {customizer}
            </div>
          </th>
        );
      }

      return renderHeaderCell(col, {
        roundedRight: index === trailingPaneCols.length - 1,
      });
    };

    const renderLeadingBodyCell = (col: ResolvedColumn, row: TRow, ctx: TCtx) => {
      if (col.fixed === 'leading' && col.key === fixedLeading?.key) {
        return (
          <td
            key={col.key}
            className="border-b border-border-default p-3 h-[46px] align-middle text-center leading-[0]"
          >
            {leadingCell?.(row)}
          </td>
        );
      }

      return renderDataCell(col, row, ctx);
    };

    const renderTrailingBodyCell = (
      col: ResolvedColumn,
      row: TRow,
      ctx: TCtx,
    ) => {
      if (col.fixed === 'trailing' && col.key === fixedTrailing?.key) {
        return (
          <td
            key={col.key}
            className="border-b border-border-default p-3 h-[46px] align-middle text-center leading-[0]"
          >
            {trailingCell?.(row)}
          </td>
        );
      }

      return renderDataCell(col, row, ctx);
    };

    const renderPaneRows = (
      pane: 'leading' | 'center' | 'trailing',
      paneCols: ResolvedColumn[],
    ) =>
      data.map((row, rowIndex) => {
        const ctx = (rowCtx ? rowCtx(row) : undefined) as TCtx;
        const resolvedRowKey = rowKey(row);
        const extra = rowProps?.(row);
        const {
          className: extraClassName,
          onMouseEnter,
          onMouseLeave,
          style: extraStyle,
          ...extraRest
        } = extra ?? {};
        const isHovered = hoveredRowKey === resolvedRowKey;

        return (
          <TableRow
            key={resolvedRowKey}
            hoverable={false}
            className={cn(
              extraClassName,
              isHovered && 'bg-surface-btn-secondary-hover/70',
            )}
            style={{
              ...(extraStyle ?? {}),
              ...(getBodyRowStyle(rowIndex) ?? {}),
            }}
            ref={(node) => {
              if (pane === 'leading') {
                leadingBodyRowRefs.current[rowIndex] = node;
                return;
              }
              if (pane === 'center') {
                centerBodyRowRefs.current[rowIndex] = node;
                return;
              }
              trailingBodyRowRefs.current[rowIndex] = node;
            }}
            onMouseEnter={(event) => {
              setHoveredRowKey(resolvedRowKey);
              onMouseEnter?.(event);
            }}
            onMouseLeave={(event) => {
              setHoveredRowKey((current) =>
                current === resolvedRowKey ? null : current,
              );
              onMouseLeave?.(event);
            }}
            {...extraRest}
          >
            {paneCols.map((col) => {
              if (pane === 'leading') return renderLeadingBodyCell(col, row, ctx);
              if (pane === 'trailing') {
                return renderTrailingBodyCell(col, row, ctx);
              }
              return renderDataCell(col, row, ctx);
            })}
          </TableRow>
        );
      });

    return (
      <div className="relative w-full min-w-0">
        <div className="flex w-full min-w-0">
          {leadingPaneCols.length > 0 ? (
            <div
              className={cn(
                'relative shrink-0',
                hasOverflow && SHADOW_LEADING,
              )}
              style={leadingPaneWidth > 0 ? { width: leadingPaneWidth } : undefined}
            >
              <table
                className="border-separate"
                style={{
                  tableLayout: 'fixed',
                  width: leadingPaneWidth > 0 ? leadingPaneWidth : undefined,
                  borderSpacing: 0,
                }}
              >
                <colgroup>
                  {leadingPaneCols.map((col) => (
                    <col
                      key={col.key}
                      style={
                        col.widthPx !== undefined ? { width: col.widthPx } : undefined
                      }
                    />
                  ))}
                </colgroup>
                <TableHeader>
                  <TableRow
                    hoverable={false}
                    ref={leadingHeaderRowRef}
                    style={getHeaderRowStyle()}
                  >
                    {leadingPaneCols.map((col, index) =>
                      renderLeadingHeaderCell(col, index),
                    )}
                  </TableRow>
                </TableHeader>
                {data.length > 0 ? <TableBody>{renderPaneRows('leading', leadingPaneCols)}</TableBody> : null}
              </table>
            </div>
          ) : null}

          <div
            ref={centerWrapperRef}
            className="min-w-0 flex-1 overflow-x-auto overscroll-x-none hide-scrollbar"
          >
            <table
              className="w-full border-separate"
              style={{
                tableLayout: 'fixed',
                minWidth: centerPaneMinWidth > 0 ? centerPaneMinWidth : undefined,
                borderSpacing: 0,
              }}
            >
              <colgroup>
                {centerPaneCols.map((col) => {
                  const width = centerColWidthFor(col);
                  return (
                    <col
                      key={col.key}
                      style={width !== undefined ? { width } : undefined}
                    />
                  );
                })}
              </colgroup>
              <TableHeader>
                <TableRow
                  hoverable={false}
                  ref={centerHeaderRowRef}
                  style={getHeaderRowStyle()}
                >
                  {centerPaneCols.map((col, index) =>
                    renderHeaderCell(col, {
                      roundedLeft: leadingPaneCols.length === 0 && index === 0,
                      roundedRight:
                        trailingPaneCols.length === 0 &&
                        index === centerPaneCols.length - 1,
                    }),
                  )}
                </TableRow>
              </TableHeader>
              {data.length > 0 ? <TableBody>{renderPaneRows('center', centerPaneCols)}</TableBody> : null}
            </table>
          </div>

          {trailingPaneCols.length > 0 ? (
            <div
              className={cn(
                'relative shrink-0',
                hasOverflow && SHADOW_TRAILING,
              )}
              style={
                trailingPaneWidth > 0 ? { width: trailingPaneWidth } : undefined
              }
            >
              <table
                className="border-separate"
                style={{
                  tableLayout: 'fixed',
                  width: trailingPaneWidth > 0 ? trailingPaneWidth : undefined,
                  borderSpacing: 0,
                }}
              >
                <colgroup>
                  {trailingPaneCols.map((col) => (
                    <col
                      key={col.key}
                      style={
                        col.widthPx !== undefined ? { width: col.widthPx } : undefined
                      }
                    />
                  ))}
                </colgroup>
                <TableHeader>
                  <TableRow
                    hoverable={false}
                    ref={trailingHeaderRowRef}
                    style={getHeaderRowStyle()}
                  >
                    {trailingPaneCols.map((col, index) =>
                      renderTrailingHeaderCell(col, index),
                    )}
                  </TableRow>
                </TableHeader>
                {data.length > 0 ? (
                  <TableBody>{renderPaneRows('trailing', trailingPaneCols)}</TableBody>
                ) : null}
              </table>
            </div>
          ) : null}
        </div>

        {data.length === 0 && emptyState ? (
          <div className="w-full border-b border-border-default bg-white">
            {emptyState}
          </div>
        ) : null}

        {!fixedTrailing ? (
          <div className="absolute right-2 top-[13px]">{customizer}</div>
        ) : null}
      </div>
    );
  }

  return (
    // `min-w-0` overrides the `min-width: auto` that flex children get by
    // default — without it, the table's `minWidth` propagates up through a
    // flex ancestor and forces the page to scroll horizontally instead of
    // the wrapper, which kills the sticky columns.
    //
    // The scrollbar utilities hide the native horizontal scrollbar. Browser
    // scrollbars span the full width of their scroll container — including
    // visually overlapping the sticky leading/trailing columns. The drop
    // shadows on those columns already telegraph "more content this way",
    // so we hide the bar and let users scroll via touchpad / shift+wheel /
    // keyboard. Standard pattern for tables with sticky columns.
    <div
      ref={wrapperRef}
      className="relative w-full min-w-0 overflow-x-auto overscroll-x-none hide-scrollbar"
    >
      <table
        // `border-separate` + `border-spacing: 0` is required for sticky
        // table cells to actually stick under `overflow-x-auto`. Browsers
        // (Safari especially) silently break `position: sticky` on <th>/<td>
        // when the table uses `border-collapse: collapse` — the cells scroll
        // along with the rest, which is exactly the "whole table scrolls"
        // symptom. Body cells already declare their own `border-b`, so the
        // visual is unchanged.
        className="w-full border-separate"
        style={{ tableLayout: 'fixed', minWidth: minTableWidth, borderSpacing: 0 }}
      >
        <colgroup>
          {colgroupCols.map((col) => {
            const width = colWidthFor(col);
            return (
              <col
                key={col.key}
                style={width !== undefined ? { width } : undefined}
              />
            );
          })}
        </colgroup>
        <TableHeader>
          <TableRow hoverable={false}>
            {fixedLeading ? (
              (() => {
                const meta = stickyMeta.get(fixedLeading.key);
                return (
                  <th
                    // align-middle / text-center / leading-[0] mirror the styling
                    // <TableHeaderCell type="checkbox"> applies in the shared
                    // table primitive, so the leading checkbox column visually
                    // matches every non-customizable table in the product.
                    // Shadow only applies if this is the inner-most leading
                    // sticky cell (no locked col immediately to its right).
                    className={cn(
                      'bg-neutral-200 h-[46px] p-3 align-middle text-center leading-[0]',
                      meta?.isOutermost && 'rounded-tl-lg',
                      'sticky z-10',
                      hasOverflow && meta?.isInnermost && SHADOW_LEADING,
                    )}
                    style={{ left: meta?.offsetPx ?? 0 }}
                  >
                    {leadingHeader?.()}
                  </th>
                );
              })()
            ) : null}

            {visibleReorderable.map((col, idx) => {
              const sortField = getSortKey(col);
              const isLastNonTrailing =
                !fixedTrailing && idx === visibleReorderable.length - 1;
              const meta = stickyMeta.get(col.key);
              if (meta) {
                // Locked column — sticky to its side with cumulative offset,
                // shadow only on the inner-most member of the sticky group.
                const stickySide =
                  meta.side === 'leading' ? 'left' : 'right';
                return (
                  <TableHeaderCell
                    key={col.key}
                    type="default"
                    label={col.label}
                    sortable={col.sortable}
                    sortOrder={col.sortable ? getSortOrder(sortField) : null}
                    onSort={col.sortable ? () => toggleSort(sortField) : undefined}
                    roundedLeft={!fixedLeading && meta.isOutermost && meta.side === 'leading'}
                    roundedRight={!fixedTrailing && meta.isOutermost && meta.side === 'trailing'}
                    className={cn(
                      'sticky z-10',
                      hasOverflow &&
                        meta.isInnermost &&
                        (meta.side === 'leading' ? SHADOW_LEADING : SHADOW_TRAILING),
                    )}
                    style={{ [stickySide]: meta.offsetPx }}
                  />
                );
              }
              return (
                <TableHeaderCell
                  key={col.key}
                  type="default"
                  label={col.label}
                  sortable={col.sortable}
                  sortOrder={col.sortable ? getSortOrder(sortField) : null}
                  onSort={col.sortable ? () => toggleSort(sortField) : undefined}
                  roundedLeft={!fixedLeading && idx === 0}
                  roundedRight={isLastNonTrailing}
                />
              );
            })}

            {fixedTrailing ? (() => {
              const meta = stickyMeta.get(fixedTrailing.key);
              return (
              <th
                className={cn(
                  'bg-neutral-200 h-[46px] p-3',
                  meta?.isOutermost && 'rounded-tr-lg',
                  'sticky z-10',
                  hasOverflow && meta?.isInnermost && SHADOW_TRAILING,
                )}
                style={{ right: meta?.offsetPx ?? 0 }}
              >
                <div
                  className={cn(
                    'flex items-center gap-1',
                    // Center the customizer when the trailing header is empty
                    // (the common case — actions columns have no label).
                    // When the host table provides header content, push the
                    // trigger to the right edge so content + trigger sit in
                    // the same cell side by side.
                    trailingHeader ? 'justify-end' : 'justify-center',
                  )}
                >
                  {trailingHeader ? (
                    <div className="min-w-0 flex-1">{trailingHeader()}</div>
                  ) : null}
                  {customizer}
                </div>
              </th>
              );
            })() : null}
          </TableRow>
        </TableHeader>

        <TableBody>
          {data.length === 0 && emptyState ? (
            <TableRow hoverable={false}>
              <td
                colSpan={
                  visibleReorderable.length +
                  (fixedLeading ? 1 : 0) +
                  (fixedTrailing ? 1 : 0)
                }
                className="border-b-0 p-0"
              >
                {emptyState}
              </td>
            </TableRow>
          ) : (
            data.map((row) => {
              const ctx = (rowCtx ? rowCtx(row) : undefined) as TCtx;
              const extra = rowProps?.(row);
              const { className: extraClassName, ...extraRest } = extra ?? {};
              return (
                <TableRow
                  key={rowKey(row)}
                  className={cn('group/row', extraClassName)}
                  {...extraRest}
                >
                  {fixedLeading ? (() => {
                    const meta = stickyMeta.get(fixedLeading.key);
                    return (
                    <td
                      // Sticky cells must stay opaque so horizontally-scrolled
                      // content doesn't bleed through. We can't share the
                      // <tr>'s translucent hover bg, so we mirror it on the
                      // sticky cell with `group-hover` to keep hover uniform
                      // across all columns. The align-middle / text-center /
                      // leading-[0] trio mirrors <TableCell type="checkbox">
                      // in the shared primitive so the row checkbox lines up
                      // identically to every other table in the product.
                      className={cn(
                        'border-b border-border-default p-3 h-[46px] bg-white transition-colors',
                        'align-middle text-center leading-[0]',
                        'group-hover/row:bg-surface-btn-secondary-hover',
                        'sticky z-10',
                        hasOverflow && meta?.isInnermost && SHADOW_LEADING,
                      )}
                      style={{ left: meta?.offsetPx ?? 0 }}
                    >
                      {leadingCell?.(row)}
                    </td>
                    );
                  })() : null}

                  {visibleReorderable.map((col) => {
                    const renderer = renderers[col.key];
                    if (!renderer) {
                      return (
                        <td
                          key={col.key}
                          className="border-b border-border-default p-3 h-[46px]"
                        />
                      );
                    }
                    const meta = stickyMeta.get(col.key);
                    const node = renderer(row, ctx);
                    if (meta && isValidElement(node)) {
                      // Inject sticky styling onto the renderer's <td> so
                      // locked body cells stick alongside the fixed cells.
                      // The shadow only lands on the inner-most member of
                      // the sticky group on each side.
                      const stickySide =
                        meta.side === 'leading' ? 'left' : 'right';
                      const existingProps = node.props as {
                        className?: string;
                        style?: React.CSSProperties;
                      };
                      return cloneElement(node, {
                        key: col.key,
                        className: cn(
                          existingProps.className,
                          'sticky z-10 bg-white transition-colors',
                          'group-hover/row:bg-surface-btn-secondary-hover',
                          hasOverflow &&
                            meta.isInnermost &&
                            (meta.side === 'leading'
                              ? SHADOW_LEADING
                              : SHADOW_TRAILING),
                        ),
                        style: {
                          ...(existingProps.style ?? {}),
                          [stickySide]: meta.offsetPx,
                        },
                      } as Partial<typeof existingProps>);
                    }
                    return <RendererCell key={col.key} node={node} />;
                  })}

                  {fixedTrailing ? (() => {
                    const meta = stickyMeta.get(fixedTrailing.key);
                    return (
                    <td
                      // Mirror the header's centering rules so the action
                      // icons line up with the customizer trigger above (and
                      // with the leading-column checkbox styling).
                      className={cn(
                        'border-b border-border-default p-3 h-[46px] bg-white transition-colors',
                        'align-middle text-center leading-[0]',
                        'group-hover/row:bg-surface-btn-secondary-hover',
                        'sticky z-10',
                        hasOverflow && meta?.isInnermost && SHADOW_TRAILING,
                      )}
                      style={{ right: meta?.offsetPx ?? 0 }}
                    >
                      {trailingCell?.(row)}
                    </td>
                    );
                  })() : null}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </table>

      {/* Fallback for tables without a trailing fixed column. The customizer
          floats at the right edge, vertically centered in the 46px header
          row, so it lines up with the rightmost column's label rather than
          hovering above it. */}
      {!fixedTrailing ? (
        <div className="absolute right-2 top-[13px]">{customizer}</div>
      ) : null}
    </div>
  );
}

// Cell renderers return their own <td>, so we just spread the ReactNode.
// Wrapping would break native colspan inheritance.
function RendererCell({ node }: { node: ReactNode }) {
  return <>{node}</>;
}
