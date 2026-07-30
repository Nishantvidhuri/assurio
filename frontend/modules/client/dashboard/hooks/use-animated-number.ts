'use client';

import { useEffect, useRef, useState } from 'react';

interface UseAnimatedNumberOptions {
  /** First-mount 0 → target tween duration (ms). Default 1000. */
  initialDuration?: number;
  /** Subsequent target-change tween duration (ms). Default 400. */
  updateDuration?: number;
  /** Skip the tween entirely and return target immediately. */
  disabled?: boolean;
  /**
   * Decimal places to preserve while tweening. Default 0 (integer counts).
   * Set to e.g. 1 so a metric like "2.4" animates through its decimals
   * (0.0 → 2.4) instead of snapping to a rounded integer.
   */
  fractionDigits?: number;
}

const DEFAULT_INITIAL_DURATION = 1000;
const DEFAULT_UPDATE_DURATION = 400;

/** Cubic ease-out — matches ECharts' default entrance feel. */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Smoothly animates an integer toward {@link target}. Returns the displayed
 * value as an integer suitable for formatting.
 *
 * Behavior:
 *   - First render: displayed value starts at 0 and tweens up to target
 *     over `initialDuration` using cubic ease-out.
 *   - Subsequent target changes: tween from the current displayed value
 *     (captured before the change) to the new target over `updateDuration`.
 *   - `prefers-reduced-motion: reduce` → snap to target immediately.
 *
 * Any in-flight animation is cancelled cleanly before a new one starts, so
 * bursts of rapid updates don't stack or overshoot.
 */
export function useAnimatedNumber(
  target: number,
  options: UseAnimatedNumberOptions = {},
): number {
  const reduceMotion = prefersReducedMotion() || options.disabled === true;
  const initialDuration =
    options.initialDuration ?? DEFAULT_INITIAL_DURATION;
  const updateDuration = options.updateDuration ?? DEFAULT_UPDATE_DURATION;
  // Round each frame to this many decimals so fractional metrics keep their
  // precision (factor = 1 for integers → identical to the old behavior).
  const roundingFactor = 10 ** (options.fractionDigits ?? 0);

  // Track whether this is the first render vs. a prop-change update.
  const hasMountedRef = useRef(false);
  // Ref mirror of the last displayed value so the tween can start from
  // wherever the user visually sees the number right now.
  const displayedRef = useRef(0);
  // Prior `reduceMotion` value, used to detect transitions out of the
  // disabled state — when that happens we snap to the new target instead
  // of tweening from whatever the disabled-state target was (e.g. tour
  // fixture 1200 back to real 0).
  const prevReduceMotionRef = useRef(reduceMotion);
  const rafRef = useRef<number | null>(null);

  const [displayed, setDisplayed] = useState<number>(() => {
    if (reduceMotion) return target;
    return 0;
  });

  useEffect(() => {
    // If we just exited reduceMotion (e.g. product tour turned off), snap
    // both the ref and React state to the live target. Without this the
    // animation block below would tween from the disabled-state target
    // down to the new one.
    if (prevReduceMotionRef.current && !reduceMotion) {
      displayedRef.current = target;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayed(target);
    }
    prevReduceMotionRef.current = reduceMotion;

    if (reduceMotion) {
      displayedRef.current = target;
      hasMountedRef.current = true;
      // Keep displayed STATE in sync with target while motion is off, so
      // the next render after `disabled` flips back to false has its
      // animation calculated from the snapped value (from === to → no
      // tween) rather than a stale pre-disable displayed.
      setDisplayed(target);
      return;
    }

    // Cancel any in-flight frame before starting a new tween.
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const from = hasMountedRef.current ? displayedRef.current : 0;
    const to = target;

    // Already at target — nothing to animate.
    if (from === to) {
      hasMountedRef.current = true;
      return;
    }

    const duration = hasMountedRef.current
      ? updateDuration
      : initialDuration;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOut(progress);
      const next =
        Math.round((from + (to - from) * eased) * roundingFactor) /
        roundingFactor;

      displayedRef.current = next;
      setDisplayed(next);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    hasMountedRef.current = true;

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, initialDuration, reduceMotion, updateDuration, roundingFactor]);

  return reduceMotion ? target : displayed;
}
