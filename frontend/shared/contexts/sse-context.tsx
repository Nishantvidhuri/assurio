'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuthSession } from '@/modules/auth/commons/auth-session.context';
import { AUTH_INVALIDATED_EVENT } from '@/shared/http/api-client';

const SSE_URL =
  `${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'}/v1/sse/subscribe`;

const RECONNECT_DELAY_MS = 3_000;

type SSECallback = (data: unknown) => void;

interface SSEContextValue {
  subscribe: (eventType: string, callback: SSECallback) => () => void;
  connected: boolean;
}

const SSEContext = createContext<SSEContextValue | undefined>(undefined);

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthSession();
  const [connected, setConnected] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const listenersRef = useRef<Map<string, Set<SSECallback>>>(new Map());
  const boundHandlersRef = useRef<Map<string, (event: MessageEvent) => void>>(
    new Map(),
  );
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createConnectionRef = useRef<() => void>(() => {});

  // Liveness tracking. The server sends a 'heartbeat' event every
  // 30 s — without an active connection, no messages arrive at all.
  // Stale-connection detection: if nothing has been received for >60s
  // we treat the EventSource as dead and force a manual reconnect.
  // Catches the "silent drop" case where EventSource.readyState stays
  // OPEN but the underlying TCP / proxy connection has died.
  // Seeded in the liveness effect (not here) — calling Date.now() during
  // render is an impure call the React compiler flags.
  const lastMessageAtRef = useRef<number>(0);
  const livenessTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const STALE_THRESHOLD_MS = 60_000;

  // Derive a stable boolean — prevents effect re-runs on user object changes
  const isAuthenticated = !!user;

  // --- Helpers (stable refs, no deps on state) ---

  const makeEventHandler = useCallback(
    (eventType: string) => (event: MessageEvent) => {
      // Any inbound event (including heartbeats) is proof the
      // connection is alive — bump the liveness timestamp.
      lastMessageAtRef.current = Date.now();
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch {
        data = event.data;
      }

      const callbacks = listenersRef.current.get(eventType);
      if (callbacks) {
        for (const cb of callbacks) {
          cb(data);
        }
      }
    },
    [],
  );

  const attachListenersToEventSource = useCallback(
    (es: EventSource) => {
      // Clear old bound handlers
      boundHandlersRef.current.clear();

      // Re-attach handlers for all currently registered event types
      for (const [eventType, callbacks] of listenersRef.current.entries()) {
        if (callbacks.size > 0) {
          const handler = makeEventHandler(eventType);
          es.addEventListener(eventType, handler);
          boundHandlersRef.current.set(eventType, handler);
        }
      }
    },
    [makeEventHandler],
  );

  const createConnection = useCallback(() => {
    // Singleton guard — never create a second connection
    if (eventSourceRef.current) return;

    const es = new EventSource(SSE_URL, { withCredentials: true });
    eventSourceRef.current = es;

    let hasConnectedBefore = false;

    es.onopen = () => {
      setConnected(true);
      lastMessageAtRef.current = Date.now();

      if (hasConnectedBefore) {
        // Broadcast reconnect signal to all listeners so they can re-fetch state
        for (const [, callbacks] of listenersRef.current) {
          for (const cb of callbacks) {
            try {
              cb({ __reconnected: true });
            } catch {
              /* ignore */
            }
          }
        }
      }

      hasConnectedBefore = true;
    };

    // Heartbeats arrive as named events too. Bind a no-op listener
    // ONLY for the side effect of bumping the liveness timestamp via
    // makeEventHandler. Without this, a connection that's quietly
    // delivering heartbeats but no other events would look "stale" to
    // the liveness checker and trigger a needless reconnect every 60s.
    const heartbeatHandler = makeEventHandler('heartbeat');
    es.addEventListener('heartbeat', heartbeatHandler);
    boundHandlersRef.current.set('heartbeat', heartbeatHandler);

    es.onerror = () => {
      setConnected(false);

      // If the connection is fully closed (not just a transient error),
      // clean up and schedule a manual reconnect.
      if (es.readyState === EventSource.CLOSED) {
        es.close();
        eventSourceRef.current = null;
        boundHandlersRef.current.clear();

        // Schedule reconnect — the effect won't re-run since isAuthenticated
        // hasn't changed, so we must reconnect manually.
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          // Only reconnect if still authenticated and not already connected
          if (!eventSourceRef.current) {
            createConnectionRef.current();
          }
        }, RECONNECT_DELAY_MS);
      }
      // For transient errors (readyState === CONNECTING), native EventSource
      // auto-reconnects — we just mark connected=false until onopen fires.
    };

    attachListenersToEventSource(es);
  }, [attachListenersToEventSource]);

  useEffect(() => {
    createConnectionRef.current = createConnection;
  }, [createConnection]);

  const closeConnection = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (livenessTimerRef.current) {
      clearInterval(livenessTimerRef.current);
      livenessTimerRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      boundHandlersRef.current.clear();
      setConnected(false);
    }
  }, []);

  // Periodic stale-connection detector. EventSource's native onerror
  // doesn't always fire when the underlying TCP connection silently
  // dies (network handoff, proxy idle-kill, tunnel hiccup). The
  // EventSource stays in OPEN state but no messages arrive. Without
  // this check, the dead connection would never be recovered until
  // the user manually refreshed. 15s tick is twice as frequent as
  // the 30s heartbeat so we notice within at most one heartbeat
  // window past the 60s stale threshold.
  useEffect(() => {
    if (!isAuthenticated) return;
    // Seed liveness on mount so the first interval tick has a baseline.
    lastMessageAtRef.current = Date.now();
    livenessTimerRef.current = setInterval(() => {
      if (!eventSourceRef.current) return;
      const age = Date.now() - lastMessageAtRef.current;
      if (age < STALE_THRESHOLD_MS) return;
      // Force a hard reset: close + clear refs + reconnect on the
      // next tick. createConnection's singleton guard will be happy
      // because we've nulled the ref.
      try {
        eventSourceRef.current.close();
      } catch {
        /* noop */
      }
      eventSourceRef.current = null;
      boundHandlersRef.current.clear();
      setConnected(false);
      createConnectionRef.current();
      lastMessageAtRef.current = Date.now();
    }, 15_000);
    return () => {
      if (livenessTimerRef.current) {
        clearInterval(livenessTimerRef.current);
        livenessTimerRef.current = null;
      }
    };
  }, [isAuthenticated]);

  // --- Subscribe API (stable — no deps on EventSource lifecycle) ---

  const subscribe = useCallback(
    (eventType: string, callback: SSECallback): (() => void) => {
      if (!listenersRef.current.has(eventType)) {
        listenersRef.current.set(eventType, new Set());
      }

      const callbacks = listenersRef.current.get(eventType)!;
      callbacks.add(callback);

      // If EventSource exists, ensure this event type has a handler attached
      const es = eventSourceRef.current;
      if (es && !boundHandlersRef.current.has(eventType)) {
        const handler = makeEventHandler(eventType);
        es.addEventListener(eventType, handler);
        boundHandlersRef.current.set(eventType, handler);
      }

      return () => {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          listenersRef.current.delete(eventType);

          const boundHandler = boundHandlersRef.current.get(eventType);
          if (boundHandler && eventSourceRef.current) {
            eventSourceRef.current.removeEventListener(eventType, boundHandler);
          }
          boundHandlersRef.current.delete(eventType);
        }
      };
    },
    [makeEventHandler],
  );

  // --- Connection lifecycle: open when authenticated, close when not ---

  useEffect(() => {
    if (!isAuthenticated) {
      const closeTimer = window.setTimeout(() => {
        closeConnection();
      }, 0);
      return () => {
        window.clearTimeout(closeTimer);
      };
    }

    const connectTimer = window.setTimeout(() => {
      // Singleton guard — if already connected, do nothing
      if (!eventSourceRef.current) {
        createConnection();
      }
    }, 0);

    return () => {
      window.clearTimeout(connectTimer);
    };
  }, [isAuthenticated, createConnection, closeConnection]);

  // --- Close on auth invalidation (token expiry, forced logout) ---

  useEffect(() => {
    const handleAuthInvalidated = () => closeConnection();

    window.addEventListener(AUTH_INVALIDATED_EVENT, handleAuthInvalidated);
    return () => {
      window.removeEventListener(AUTH_INVALIDATED_EVENT, handleAuthInvalidated);
    };
  }, [closeConnection]);

  // --- Context value ---

  const value = useMemo(
    () => ({ subscribe, connected }),
    [subscribe, connected],
  );

  return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>;
}

export function useSSE(): SSEContextValue {
  const context = useContext(SSEContext);
  if (!context) {
    throw new Error('useSSE must be used inside SSEProvider');
  }
  return context;
}
