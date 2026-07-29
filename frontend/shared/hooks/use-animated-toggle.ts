import { useEffect, useState } from 'react';

/**
 * Hook for animating mount/unmount of elements.
 * Returns `shouldRender` (keep in DOM) and `isVisible` (apply open styles).
 * On close, `isVisible` becomes false first (triggering close animation),
 * then `shouldRender` becomes false after `duration` ms (removing from DOM).
 *
 * @param open - whether the element should be shown
 * @param duration - animation duration in ms (default 300)
 */
export function useAnimatedToggle(open: boolean, duration = 300) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isVisible, setIsVisible] = useState(open);

  useEffect(() => {
    if (open) {
      const mountFrame = requestAnimationFrame(() => {
        setShouldRender(true);
      });
      // Small delay to ensure DOM is rendered before applying visible styles
      const showFrame = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });

      return () => {
        cancelAnimationFrame(mountFrame);
        cancelAnimationFrame(showFrame);
      };
    } else {
      const hideFrame = requestAnimationFrame(() => {
        setIsVisible(false);
      });
      const timer = setTimeout(() => setShouldRender(false), duration);

      return () => {
        cancelAnimationFrame(hideFrame);
        clearTimeout(timer);
      };
    }
  }, [open, duration]);

  return { shouldRender, isVisible };
}
