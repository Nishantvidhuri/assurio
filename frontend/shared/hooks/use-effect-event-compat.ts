'use client';

/**
 * Compat shim for React's `useEffectEvent`.
 *
 * Recriauth runs Next 16, whose vendored React exports `useEffectEvent`.
 * Assurio is on Next 15, whose App Router bundles an older vendored React
 * that does NOT — even with react@19.2 in node_modules (`useEffectEvent is
 * not a function` at runtime). Same semantics: a stable identity callback
 * that always sees the latest render's values.
 *
 * Drop this shim (restore the react import) if/when Next is upgraded to 16.
 */
import { useCallback, useLayoutEffect, useRef } from 'react';

export function useEffectEvent<Args extends unknown[], Ret>(
  fn: (...args: Args) => Ret,
): (...args: Args) => Ret {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}
