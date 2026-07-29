'use client';

import { useEffect } from 'react';
import { useEffectEvent } from './use-effect-event-compat';
import { useSSE } from '../contexts/sse-context';

/**
 * Subscribe to a specific SSE event type. Auto-unsubscribes on unmount.
 * Pass `null` as eventType to conditionally disable the subscription.
 *
 * Uses stable refs for both callback and subscribe to prevent
 * unnecessary re-subscriptions on re-renders.
 */
export function useSSEEvent<T = unknown>(
  eventType: string | null,
  callback: (data: T) => void,
): void {
  const { subscribe } = useSSE();
  const handleEvent = useEffectEvent(callback);

  useEffect(() => {
    if (!eventType) return;

    const unsubscribe = subscribe(eventType, (data) => {
      handleEvent(data as T);
    });
    return unsubscribe;
  }, [eventType, subscribe]);
}
