'use client';

import { useRef, useState, type DragEvent } from 'react';

interface DragPreviewOffset {
  x: number;
  y: number;
}

function resolveRowElement(
  target: HTMLElement | null,
  selector: string | undefined,
): HTMLElement | null {
  if (!target) return null;
  if (selector) {
    const found = target.closest(selector);
    return found instanceof HTMLElement ? found : null;
  }
  return target.parentElement;
}

/**
 * Reorder an array by moving the item with `sourceId` to the position of the
 * item with `targetId`. Used by consumers of `useDragReorder` to compute the
 * new array shape inside their `onReorder` callback — same algorithm both
 * `column-customizer`, `base-checks-table`, and `package-check-selector-section`
 * end up doing inline, hence centralised here.
 *
 * Returns the original array (referentially equal) when the move is a no-op
 * so React state updaters can bail out cheaply.
 */
export function reorderById<T>(
  items: T[],
  sourceId: string,
  targetId: string,
  getId: (item: T) => string,
): T[] {
  if (sourceId === targetId) return items;
  const sourceIdx = items.findIndex((item) => getId(item) === sourceId);
  const targetIdx = items.findIndex((item) => getId(item) === targetId);
  if (sourceIdx < 0 || targetIdx < 0 || sourceIdx === targetIdx) return items;
  const next = items.slice();
  const [moved] = next.splice(sourceIdx, 1);
  next.splice(targetIdx, 0, moved);
  return next;
}

interface UseDragReorderOptions {
  onReorder: (sourceId: string, targetId: string) => void | Promise<void>;
  itemSelector?: string;
  dragPreviewOffset?: DragPreviewOffset;
  styleDragPreview?: (preview: HTMLElement, sourceElement: HTMLElement) => void;
  animationMs?: number;
  flipRowSelector?: string;
}

export function useDragReorder({
  onReorder,
  itemSelector,
  dragPreviewOffset = { x: 24, y: 24 },
  styleDragPreview,
  animationMs = 180,
  flipRowSelector,
}: UseDragReorderOptions) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragPreviewRef = useRef<HTMLElement | null>(null);
  const draggedWrapperRef = useRef<HTMLElement | null>(null);

  const clearDragPreview = () => {
    dragPreviewRef.current?.remove();
    dragPreviewRef.current = null;
  };

  const clearDragState = () => {
    setDraggedId(null);
    setDragOverId(null);
    clearDragPreview();
  };

  const clearDragOver = () => {
    setDragOverId(null);
  };

  const handleDragStart = <T extends HTMLElement>(
    event: DragEvent<T>,
    id: string,
  ) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);

    if (itemSelector) {
      const itemElement = event.currentTarget.closest(itemSelector);
      if (itemElement instanceof HTMLElement) {
        const dragPreview = itemElement.cloneNode(true);
        if (dragPreview instanceof HTMLElement) {
          clearDragPreview();
          dragPreview.style.position = 'fixed';
          dragPreview.style.top = '-9999px';
          dragPreview.style.left = '-9999px';
          dragPreview.style.pointerEvents = 'none';
          dragPreview.style.zIndex = '9999';
          styleDragPreview?.(dragPreview, itemElement);
          document.body.appendChild(dragPreview);
          dragPreviewRef.current = dragPreview;
          event.dataTransfer.setDragImage(
            dragPreview,
            dragPreviewOffset.x,
            dragPreviewOffset.y,
          );
        } else {
          event.dataTransfer.setDragImage(
            itemElement,
            dragPreviewOffset.x,
            dragPreviewOffset.y,
          );
        }
      }
    }

    draggedWrapperRef.current = resolveRowElement(
      event.currentTarget as HTMLElement,
      flipRowSelector,
    );

    setDraggedId(id);
  };

  const lastReorderTargetRef = useRef<string | null>(null);

  const handleDragOver = <T extends HTMLElement>(
    event: DragEvent<T>,
    id: string,
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverId(id);

    if (!draggedId || id === draggedId) return;
    if (lastReorderTargetRef.current === id) return;

    const targetRow = resolveRowElement(
      event.currentTarget as HTMLElement,
      flipRowSelector,
    );
    const container = targetRow?.parentElement ?? null;
    const draggedWrapper = draggedWrapperRef.current;
    const oldRects = new Map<HTMLElement, DOMRect>();

    if (animationMs > 0 && container) {
      for (const el of Array.from(container.children)) {
        if (!(el instanceof HTMLElement) || el === draggedWrapper) continue;
        oldRects.set(el, el.getBoundingClientRect());
      }
    }

    lastReorderTargetRef.current = id;
    void onReorder(draggedId, id);

    if (oldRects.size === 0) return;
    // Wait one frame for React to commit the DOM reorder, then FLIP.
    requestAnimationFrame(() => {
      oldRects.forEach((oldRect, el) => {
        const newRect = el.getBoundingClientRect();
        const dx = oldRect.left - newRect.left;
        const dy = oldRect.top - newRect.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.getBoundingClientRect();
        el.style.transition = `transform ${animationMs}ms ease`;
        el.style.transform = '';
      });
    });
  };

  const clearFlipStyles = () => {
    const container = draggedWrapperRef.current?.parentElement;
    if (!container) return;
    for (const el of Array.from(container.children)) {
      if (!(el instanceof HTMLElement)) continue;
      el.style.transform = '';
      el.style.transition = '';
    }
  };

  const handleDrop = async <T extends HTMLElement>(
    event: DragEvent<T>,
    _targetId: string,
  ) => {
    event.preventDefault();
    clearFlipStyles();
    clearDragState();
    lastReorderTargetRef.current = null;
    draggedWrapperRef.current = null;
  };

  const handleDragEnd = () => {
    clearFlipStyles();
    clearDragState();
    lastReorderTargetRef.current = null;
    draggedWrapperRef.current = null;
  };

  return {
    draggedId,
    dragOverId,
    clearDragOver,
    clearDragState,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  };
}
