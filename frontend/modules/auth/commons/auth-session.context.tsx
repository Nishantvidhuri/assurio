'use client';

/**
 * Assurio shim for the RDS `auth-session.context`.
 *
 * The original Recriauth context is wired to that product's auth API layer
 * (api-client / auth.api / auth.service), which conflicts with Assurio's own
 * cookie-based auth. Rather than importing that whole stack, this adapter
 * exposes the same surface (`AuthSessionProvider` / `useAuthSession`) backed by
 * Assurio's session helpers, so RDS components that read the session — topbar,
 * insufficient-credits-dialog, etc. — work unmodified.
 *
 * Fields RDS knows about but Assurio has no concept of (organization, billing
 * model, internal access tier) resolve to null.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUser } from './auth.types';
import { me as fetchMe, type AuthUser as AssurioUser } from '@/app/lib/api';
import { clearSession, getUser } from '@/app/lib/session';

interface AuthSessionContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  error: Error | null;
  refreshSession: () => Promise<AuthUser | null>;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
}

/** Map an Assurio user onto the richer RDS AuthUser shape. */
function toAuthUser(u: AssurioUser | null): AuthUser | null {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    // Assurio roles are 'admin' | 'owner' | 'candidate'; RDS expects its own
    // enums. Cast through unknown — consumers only compare, never construct.
    userType: (u.role === 'admin' ? 'INTERNAL' : 'CLIENT') as AuthUser['userType'],
    role: (u.role ?? null) as AuthUser['role'],
    access: null,
    organizationId: null,
    organizationName: null,
  } as AuthUser;
}

const AuthSessionContext = createContext<AuthSessionContextValue | undefined>(
  undefined,
);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refreshSession = useCallback(async (): Promise<AuthUser | null> => {
    setIsLoading(true);
    try {
      const fresh = toAuthUser(await fetchMe());
      setUserState(fresh);
      setError(null);
      return fresh;
    } catch (err) {
      // A clean "not logged in" leaves error null; anything else is surfaced.
      const e = err as Error;
      if (!/401|unauthor/i.test(e?.message ?? '')) setError(e);
      setUserState(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Hydrate instantly from the cached profile, then confirm with the server.
    setUserState(toAuthUser(getUser()));
    void refreshSession();
  }, [refreshSession]);

  const logout = useCallback(async () => {
    clearSession();
    setUserState(null);
  }, []);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      user,
      isLoading,
      error,
      refreshSession,
      setUser: setUserState,
      logout,
    }),
    [user, isLoading, error, refreshSession, logout],
  );

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession(): AuthSessionContextValue {
  const ctx = useContext(AuthSessionContext);
  if (ctx) return ctx;
  // RDS components may render outside the provider (Assurio pages manage their
  // own auth). Degrade to an inert session rather than throwing.
  return {
    user: null,
    isLoading: false,
    error: null,
    refreshSession: async () => null,
    setUser: () => {},
    logout: async () => {},
  };
}
