'use client';

import { type MouseEvent as ReactMouseEvent, useState } from 'react';
import { GripVertical, Menu as MenuIcon } from 'lucide-react';
import {
  Button,
  ButtonContainer,
  Checkbox,
  HoverTooltipAnchor,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SearchBar,
} from '@/shared/components/ui';
import { MenuItem } from '@/shared/components/ui/menu-item';
import { cn } from '@/shared/lib/utils';
import { useDragReorder } from '@/shared/hooks/use-drag-reorder';
import type { ResolvedColumn } from '@/shared/commons/table-column-registry';

interface ColumnCustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pending columns (live-preview state owned by CustomizableTable). */
  pendingColumns: ResolvedColumn[];
  dirty: boolean;
  saving: boolean;
  onToggle: (columnKey: string) => void;
  onReorder: (sourceKey: string, targetKey: string) => void;
  onReset: () => void;
  onSave: () => void;
}

export function ColumnCustomizer({
  open,
  onOpenChange,
  pendingColumns,
  dirty,
  saving,
  onToggle,
  onReorder,
  onReset,
  onSave,
}: ColumnCustomizerProps) {
  const [query, setQuery] = useState('');
  const isSearching = query.trim() !== '';

  // Wrap parent's onOpenChange so we can clear the search input synchronously
  // when the popover closes — keeping reset logic out of an effect.
  const handleOpenChange = (next: boolean) => {
    if (!next) setQuery('');
    onOpenChange(next);
  };

  const {
    draggedId,
    dragOverId,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  } = useDragReorder({
    onReorder: (src, tgt) => {
      if (isSearching) return;
      onReorder(src, tgt);
    },
  });

  // Only non-fixed columns are user-controllable; fixed columns aren't shown
  // in the customizer at all (in our schema they have empty labels).
  // Fixed columns (row-checkbox, actions) live in their own slots at the
  // edges of the table and never appear in the menu — users have no need to
  // see them since they can't be hidden, reordered, or interacted with.
  const reorderableRows = pendingColumns.filter((c) => !c.fixed);
  const visibleRows = isSearching
    ? reorderableRows.filter((c) =>
        c.label.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : reorderableRows;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <HoverTooltipAnchor text="Rearrange columns" position="top-right">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Personalize columns"
            className="hidden md:inline-flex size-5 items-center justify-center rounded-full text-icon-default transition-all duration-200 ease-out hover:bg-neutral-400 hover:ring-4 hover:ring-neutral-400 data-[state=open]:bg-neutral-400 data-[state=open]:ring-4 data-[state=open]:ring-neutral-400"
          >
            <MenuIcon className="size-4 -rotate-90" aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </HoverTooltipAnchor>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[282px] max-h-[480px] rounded-md border border-neutral-300 bg-white p-0 shadow-[0px_3px_10px_0px_rgba(11,26,59,0.06)] flex flex-col min-h-0"
      >
        <div className="px-2 pt-2 pb-2">
          <SearchBar
            value={query}
            onChange={setQuery}
            onClear={() => setQuery('')}
            placeholder="Search"
            containerClassName="w-full"
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-1">
          {visibleRows.length === 0 ? (
            <div className="px-3 py-6 text-center text-body-sm text-text-subheading">
              No columns match
            </div>
          ) : (
            visibleRows.map((col) => {
              const isDragged = draggedId === col.key;
              const isOver = dragOverId === col.key && draggedId !== col.key;
              // `lockedVisible` columns (e.g. Case ID) can't be hidden OR
              // reordered. They render in disabled state and don't accept
              // drag.
              const isLocked = col.lockedVisible === true;
              const canDrag = !isSearching && !isLocked;
              const dragProps = canDrag
                ? {
                    draggable: true,
                    onDragStart: (e: React.DragEvent<HTMLButtonElement>) =>
                      handleDragStart(e, col.key),
                    onDragOver: (e: React.DragEvent<HTMLButtonElement>) =>
                      handleDragOver(e, col.key),
                    onDrop: (e: React.DragEvent<HTMLButtonElement>) =>
                      void handleDrop(e, col.key),
                    onDragEnd: handleDragEnd,
                  }
                : {};

              return (
                <MenuItem
                  key={col.key}
                  state={isOver ? 'On Hover' : 'Default'}
                  menuText={col.label}
                  // Locked rows render the label in disabled grey so the
                  // whole row reads as inactive (matches the RDS spec —
                  // Figma 4642:3492 — and the disabled checkbox alongside).
                  menuTextClassName={cn(isLocked && 'text-text-disabled')}
                  // Cursor lives on both the wrapper <div> and the inner
                  // <button> so the inter-row padding (py-0.5 on MenuItem's
                  // wrapper) doesn't briefly flash a default cursor as the
                  // mouse crosses between rows. Locked rows use default
                  // cursor since they're not interactive.
                  className={cn(
                    isDragged && 'opacity-40',
                    isLocked ? 'cursor-default' : 'cursor-pointer',
                  )}
                  buttonClassName={cn(
                    isLocked ? 'cursor-default' : 'cursor-pointer',
                  )}
                  // Locked rows: clicks are no-ops so the user can't toggle
                  // them. The checkbox renders disabled below as the cue.
                  onClick={isLocked ? undefined : () => onToggle(col.key)}
                  leadingElement={
                    <Checkbox
                      size="Small"
                      disableHoverEffect
                      // `nonInteractive` makes the checkbox visual-only:
                      // pointer-events: none lets clicks pass through to the
                      // row button (which owns the toggle handler), and the
                      // checkbox stops emitting its own cursor — so the row's
                      // cursor stays continuous instead of flickering when
                      // the mouse crosses the checkbox.
                      nonInteractive
                      // Locked columns render with the disabled visual
                      // (grey box + white check) — the Checkbox primitive
                      // handles this for `disabled && checked`.
                      disabled={isLocked}
                      checked={col.visible}
                    />
                  }
                  trailingElement={
                    <span
                      onClick={(e: ReactMouseEvent<HTMLSpanElement>) =>
                        e.stopPropagation()
                      }
                      className={cn(
                        'inline-flex size-5 items-center justify-center text-icon-muted',
                        // Drag handle dims when drag is unavailable —
                        // searching or on a locked row.
                        (isSearching || isLocked) && 'opacity-40',
                      )}
                    >
                      <GripVertical className="size-4" aria-hidden="true" />
                    </span>
                  }
                  {...dragProps}
                />
              );
            })
          )}
        </div>

        <ButtonContainer
          alignment="Right"
          configuration="Without Padding"
          className="border-t border-neutral-400 p-2"
        >
          <Button variant="secondary" onClick={onReset} disabled={saving}>
            Reset to Default
          </Button>
          <Button
            variant="primary"
            onClick={onSave}
            disabled={!dirty || saving}
            isLoading={saving}
          >
            Save
          </Button>
        </ButtonContainer>
      </PopoverContent>
    </Popover>
  );
}
