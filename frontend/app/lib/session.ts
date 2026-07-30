import type { AuthUser } from './api';

const USER_KEY = 'user';

/** Reads the as_csrf cookie value set by the server (not httpOnly — intentional). */
export function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)as_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

/** Persist user profile to localStorage for fast access without a /me round-trip. */
export function saveSession(_token: string, user: AuthUser): void {
  // Token is now stored in an httpOnly cookie set by the server — do NOT store in localStorage.
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken(): string | null {
  // With httpOnly cookies the token is never accessible to JS.
  // Return a sentinel so existing call-sites that check truthiness still work;
  // actual auth comes from the cookie, which the browser sends automatically.
  if (typeof window === 'undefined') return null;
  // Return non-null if we have a user session so auth-gated pages don't redirect.
  return localStorage.getItem(USER_KEY) ? '__cookie__' : null;
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export function clearSession(): void {
  localStorage.removeItem(USER_KEY);
}

/** Landing path for a signed-in user, keyed by role. */
export function homePathForRole(role: string | undefined | null): string {
  if (role === 'admin') return '/admin';
  if (role === 'candidate') return '/candidate';
  return '/home';
}
