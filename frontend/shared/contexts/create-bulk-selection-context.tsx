'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BulkSelectionMode } from '../commons/bulk-selection.types';

export interface BulkSelectionContextValue {
  selectionMode: BulkSelectionMode;
  explicitIds: Set<string>;
  excludedIds: Set<string>;
  toggleSelect: (id: string, checked: boolean) => void;
  toggleSelectAll: (ids: string[], checked: boolean) => void;
  selectAllMatching: () => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
}

interface BulkSelectionProviderProps {
  children: ReactNode;
  scopeKey?: string;
}

export function createBulkSelectionContext(displayName: string) {
  const BulkSelectionContext = createContext<BulkSelectionContextValue | null>(
    null,
  );
  BulkSelectionContext.displayName = displayName;

  function BulkSelectionProvider({
    children,
    scopeKey = '',
  }: BulkSelectionProviderProps) {
    const [selectionMode, setSelectionMode] =
      useState<BulkSelectionMode>('EXPLICIT');
    const [explicitIds, setExplicitIds] = useState<Set<string>>(new Set());
    const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
    const previousScopeKeyRef = useRef(scopeKey);

    const clearSelection = useCallback(() => {
      setSelectionMode('EXPLICIT');
      setExplicitIds(new Set());
      setExcludedIds(new Set());
    }, []);

    useEffect(() => {
      if (previousScopeKeyRef.current !== scopeKey) {
        previousScopeKeyRef.current = scopeKey;
        queueMicrotask(clearSelection);
      }
    }, [clearSelection, scopeKey]);

    const toggleSelect = useCallback(
      (id: string, checked: boolean) => {
        if (selectionMode === 'ALL_MATCHING') {
          setExcludedIds((prev) => {
            const next = new Set(prev);
            if (checked) {
              next.delete(id);
            } else {
              next.add(id);
            }
            return next;
          });
          return;
        }

        setExplicitIds((prev) => {
          const next = new Set(prev);
          if (checked) {
            next.add(id);
          } else {
            next.delete(id);
          }
          return next;
        });
      },
      [selectionMode],
    );

    const toggleSelectAll = useCallback(
      (ids: string[], checked: boolean) => {
        if (selectionMode === 'ALL_MATCHING') {
          setExcludedIds((prev) => {
            const next = new Set(prev);
            for (const id of ids) {
              if (checked) {
                next.delete(id);
              } else {
                next.add(id);
              }
            }
            return next;
          });
          return;
        }

        setExplicitIds((prev) => {
          const next = new Set(prev);
          for (const id of ids) {
            if (checked) {
              next.add(id);
            } else {
              next.delete(id);
            }
          }
          return next;
        });
      },
      [selectionMode],
    );

    const selectAllMatching = useCallback(() => {
      setSelectionMode('ALL_MATCHING');
      setExplicitIds(new Set());
      setExcludedIds(new Set());
    }, []);

    const isSelected = useCallback(
      (id: string) =>
        selectionMode === 'ALL_MATCHING'
          ? !excludedIds.has(id)
          : explicitIds.has(id),
      [excludedIds, explicitIds, selectionMode],
    );

    const value = useMemo<BulkSelectionContextValue>(
      () => ({
        selectionMode,
        explicitIds,
        excludedIds,
        toggleSelect,
        toggleSelectAll,
        selectAllMatching,
        clearSelection,
        isSelected,
      }),
      [
        clearSelection,
        excludedIds,
        explicitIds,
        isSelected,
        selectAllMatching,
        selectionMode,
        toggleSelect,
        toggleSelectAll,
      ],
    );

    return (
      <BulkSelectionContext.Provider value={value}>
        {children}
      </BulkSelectionContext.Provider>
    );
  }

  function useBulkSelection(): BulkSelectionContextValue {
    const ctx = useContext(BulkSelectionContext);
    if (!ctx) {
      throw new Error(
        `useBulkSelection must be used within a ${displayName} provider`,
      );
    }
    return ctx;
  }

  return {
    BulkSelectionProvider,
    useBulkSelection,
  };
}
