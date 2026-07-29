'use client';

import { useEffect, useRef, useState } from 'react';

interface UseDebouncedValidationOptions<T> {
  /** Debounce delay before `validate` runs. Default 300 ms. */
  delayMs?: number;
  /**
   * Skip running `validate` when this returns false (e.g., empty value or a
   * format that wouldn't be worth a network call). Returning false also
   * clears any prior error and the in-flight indicator.
   */
  shouldRun?: (value: T) => boolean;
}

export interface UseDebouncedValidationResult {
  /** Latest validation message, or null if value is clean (or check skipped). */
  error: string | null;
  /** True between `value` change and `validate` resolving. */
  isChecking: boolean;
  /** Imperatively clear the error (e.g., the moment the user starts editing). */
  reset: () => void;
}

/**
 * Watch `value`, debounce for `delayMs`, then run `validate(value)` and
 * surface its return string as `error` (null = clean).
 *
 * Race-protected: if `value` changes again while a previous `validate` is
 * still in flight, that older resolution is discarded. Callers are expected
 * to pass stable `validate` and `shouldRun` references (defined at module
 * scope or memoized) — only `value` and `delayMs` re-arm the debounce.
 */
export function useDebouncedValidation<T>(
  value: T,
  validate: (value: T) => Promise<string | null>,
  options: UseDebouncedValidationOptions<T> = {},
): UseDebouncedValidationResult {
  const { delayMs = 300, shouldRun } = options;
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const latestValueRef = useRef<T>(value);

  useEffect(() => {
    latestValueRef.current = value;

    if (shouldRun && !shouldRun(value)) {
      setError(null);
      setIsChecking(false);
      return;
    }

    setIsChecking(true);
    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          const result = await validate(value);
          if (latestValueRef.current === value) setError(result);
        } finally {
          if (latestValueRef.current === value) setIsChecking(false);
        }
      })();
    }, delayMs);

    return () => clearTimeout(timeoutId);
    // `validate` and `shouldRun` are stable by contract; only `value` and
    // `delayMs` re-arm the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delayMs]);

  return {
    error,
    isChecking,
    reset: () => setError(null),
  };
}
