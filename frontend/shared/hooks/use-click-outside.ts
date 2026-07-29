import { useEffect, type RefObject } from 'react';

interface UseClickOutsideOptions {
  /**
   * When true (default), clicks landing inside a Radix portal layer
   * (popover/dropdown/select) are treated as "inside" so portaled
   * children don't accidentally close the parent.
   *
   * Set to `false` for components that themselves render INSIDE a Radix
   * portal — they need to close on clicks elsewhere within the same
   * portal (e.g. a dropdown nested inside a Popover should close when
   * the user clicks calendar days that share the popover surface).
   */
  ignoreRadixPortal?: boolean;
}

/**
 * Fires `handler` when a click/touch occurs outside the element referenced by `ref`.
 * Ignores clicks inside Radix UI portaled layers (popovers, dropdowns, dialogs)
 * so that interactions with portaled content don't trigger the outside handler.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: (event: MouseEvent | TouchEvent) => void,
  options?: UseClickOutsideOptions,
) {
  const ignoreRadixPortal = options?.ignoreRadixPortal ?? true;

  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;

      if (!ref.current || ref.current.contains(target)) {
        return;
      }

      if (ignoreRadixPortal && isInsideRadixPortal(target)) {
        return;
      }

      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler, ignoreRadixPortal]);
}

function isInsideRadixPortal(node: Node): boolean {
  let current = node instanceof Element ? node : node.parentElement;
  while (current) {
    if (
      current.hasAttribute('data-radix-popper-content-wrapper') ||
      current.getAttribute('data-slot') === 'popover-content' ||
      current.getAttribute('data-slot') === 'popover-trigger' ||
      current.getAttribute('role') === 'listbox' ||
      current.hasAttribute('data-radix-select-viewport') ||
      current.classList.contains('radix-popover-content')
    ) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}
