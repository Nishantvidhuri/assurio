import { useCallback, useEffect, useRef, useState } from 'react';

interface SlidingIndicatorResult {
  /** Callback ref to attach to the container wrapping all items */
  setContainerRef: (node: HTMLDivElement | null) => void;
  /** Call this to register each item's DOM element: registerItem(key, el) */
  registerItem: (key: string | number, el: HTMLElement | null) => void;
  /** Current indicator position & size */
  indicator: { left: number; width: number };
  /** Whether the initial snap has occurred (transitions enabled after this) */
  hasInitialized: boolean;
  /** Transition duration in ms — use in inline style or Tailwind class */
  duration: number;
}

/**
 * Shared hook for sliding indicator animations.
 *
 * Measures the active item's position relative to a container and returns
 * `left` / `width` values to position an absolutely-placed indicator.
 * On first render the indicator snaps instantly; subsequent changes animate.
 *
 * @param activeKey — the key of the currently active item
 * @param duration — transition duration in ms (default 400)
 *
 * @example
 * ```tsx
 * const { containerRef, registerItem, indicator, hasInitialized } = useSlidingIndicator(activeTab);
 *
 * <div ref={containerRef} className="relative flex">
 *   <div
 *     className={cn('absolute bg-primary rounded', hasInitialized && 'transition-all duration-400')}
 *     style={{ left: indicator.left, width: indicator.width, height: '100%' }}
 *   />
 *   {items.map(item => (
 *     <button ref={el => registerItem(item.key, el)} ...>{item.label}</button>
 *   ))}
 * </div>
 * ```
 */
export function useSlidingIndicator(activeKey: string | number, duration = 400): SlidingIndicatorResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef<Map<string | number, HTMLElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [hasInitialized, setHasInitialized] = useState(false);

  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
  }, []);

  const registerItem = useCallback((key: string | number, el: HTMLElement | null) => {
    if (el) {
      itemsRef.current.set(key, el);
    } else {
      itemsRef.current.delete(key);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const activeEl = itemsRef.current.get(activeKey);
    if (!container || !activeEl) return;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();

    setIndicator({
      left: activeRect.left - containerRect.left,
      width: activeRect.width,
    });

    if (!hasInitialized) {
      requestAnimationFrame(() => setHasInitialized(true));
    }
  }, [activeKey, hasInitialized]);

  return { setContainerRef, registerItem, indicator, hasInitialized, duration };
}
