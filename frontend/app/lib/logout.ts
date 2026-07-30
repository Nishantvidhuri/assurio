import { logout } from './api';
import { clearSession } from './session';

/**
 * Full sign-out: clears local state immediately, redirects to the landing
 * page (/), and fires a server-side cookie-clear in the background
 * (fire-and-forget so callers don't need to be async).
 */
export function doLogout(router: { replace: (path: string) => void }): void {
  clearSession();
  router.replace('/');
  // Ask the server to clear the httpOnly `as_access` cookie.
  // We don't await — user is already redirected; the request completes in the background.
  logout().catch(() => {});
}
