'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { tableConfigApi } from '@/shared/apis/table-config.api';
import { toast } from '@/shared/components/ui';
import type {
  ResolvedColumn,
  ResolvedLayout,
  TableAudience,
} from '@/shared/commons/table-column-registry';

interface StoreEntry {
  layout: ResolvedLayout;
  hydrated: boolean;
  hydrating: boolean;
}

type Listener = () => void;

const stores = new Map<string, StoreEntry>();
const listeners = new Map<string, Set<Listener>>();

function storeKey(audience: TableAudience, tableKey: string): string {
  return `${audience}:${tableKey}`;
}

function emit(key: string) {
  const set = listeners.get(key);
  if (!set) return;
  for (const l of set) l();
}

function subscribe(key: string, listener: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
  };
}

function writeEntry(key: string, entry: StoreEntry) {
  stores.set(key, entry);
  emit(key);
}

function buildDefaultLayout(
  tableKey: string,
  defaults: ResolvedColumn[],
): ResolvedLayout {
  return {
    tableKey,
    layoutVersion: 0,
    defaultSortField: undefined,
    columns: defaults.map((c) => ({ ...c, visible: c.defaultVisible })),
  };
}

// Apply a hidden+order payload onto the current layout's column metadata so
// the optimistic local state matches what the server will return after PUT.
// Fixed columns are preserved (they're not customizable). The popover never
// sends them, so we re-stitch them around the user-controlled ordering.
function applyPayloadToLayout(
  current: ResolvedLayout,
  hiddenColumnKeys: string[],
  columnOrder: string[],
): ResolvedLayout {
  const hidden = new Set(hiddenColumnKeys);
  const byKey = new Map(current.columns.map((c) => [c.key, c]));
  const fixedLeading = current.columns.filter((c) => c.fixed === 'leading');
  const fixedTrailing = current.columns.filter((c) => c.fixed === 'trailing');

  const reorderableNext = columnOrder
    .map((key) => byKey.get(key))
    .filter((c): c is ResolvedColumn => Boolean(c) && !c!.fixed)
    .map((c) => ({ ...c, visible: !hidden.has(c.key) }));

  return {
    ...current,
    columns: [...fixedLeading, ...reorderableNext, ...fixedTrailing],
  };
}

export interface UseTableColumnLayoutResult {
  columns: ResolvedColumn[];
  isLoading: boolean;
  defaultSortField?: string;
  /**
   * Commit a staged layout to the server. Optimistically updates local state,
   * fires PUT, rolls back and toasts on failure. Returns a promise that
   * resolves on success and rejects on failure so the caller (popover) can
   * close itself only on success.
   */
  commit: (hiddenColumnKeys: string[], columnOrder: string[]) => Promise<void>;
}

export function useTableColumnLayout(
  audience: TableAudience,
  tableKey: string,
  defaults: ResolvedColumn[],
): UseTableColumnLayoutResult {
  const key = storeKey(audience, tableKey);

  // Seed the store synchronously the first time anyone asks for this table so
  // first paint already has the defaults — no flash of empty headers.
  if (!stores.has(key)) {
    stores.set(key, {
      layout: buildDefaultLayout(tableKey, defaults),
      hydrated: false,
      hydrating: false,
    });
  }

  const snapshot = useSyncExternalStore(
    (listener) => subscribe(key, listener),
    () => stores.get(key)!,
    () => stores.get(key)!,
  );

  // Hydrate from server once per table key per session.
  useEffect(() => {
    const entry = stores.get(key)!;
    if (entry.hydrated || entry.hydrating) return;

    writeEntry(key, { ...entry, hydrating: true });

    tableConfigApi
      .get(audience, tableKey)
      .then((layout) => {
        writeEntry(key, { layout, hydrated: true, hydrating: false });
      })
      .catch(() => {
        writeEntry(key, { ...entry, hydrating: false });
      });
  }, [audience, tableKey, key]);

  const commit = useCallback(
    async (hiddenColumnKeys: string[], columnOrder: string[]): Promise<void> => {
      const previous = stores.get(key)!.layout;
      const optimistic = applyPayloadToLayout(
        previous,
        hiddenColumnKeys,
        columnOrder,
      );
      writeEntry(key, {
        layout: optimistic,
        hydrated: true,
        hydrating: false,
      });

      try {
        const persisted = await tableConfigApi.update(audience, tableKey, {
          hiddenColumnKeys,
          columnOrder,
        });
        writeEntry(key, {
          layout: persisted,
          hydrated: true,
          hydrating: false,
        });
      } catch (err) {
        writeEntry(key, {
          layout: previous,
          hydrated: true,
          hydrating: false,
        });
        toast.error('Could not save columns');
        throw err;
      }
    },
    [audience, tableKey, key],
  );

  return {
    columns: snapshot.layout.columns,
    isLoading: snapshot.hydrating && !snapshot.hydrated,
    defaultSortField: snapshot.layout.defaultSortField,
    commit,
  };
}
