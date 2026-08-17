import type { Response } from 'express';
import { randomBytes } from 'crypto';

/**
 * Session-cookie helpers shared by every credential-issuing endpoint
 * (email login/signup, Google sign-in, logout). One implementation so the
 * cookie attributes can never drift between auth paths.
 */

const IS_PROD = process.env.NODE_ENV === 'production';
export const COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// When the frontend runs on a different site than the API (e.g. two ngrok
// tunnels, or a separate prod domain), the browser only sends the auth cookie
// if it's SameSite=None; Secure. Auto-detected from an https APP_URL; force
// with COOKIE_SAMESITE_NONE=true.
const CROSS_SITE_COOKIES =
  process.env.COOKIE_SAMESITE_NONE === 'true' ||
  (process.env.APP_URL || '').startsWith('https://');
export const COOKIE_SAME_SITE: 'none' | 'lax' = CROSS_SITE_COOKIES
  ? 'none'
  : 'lax';
export const COOKIE_SECURE = IS_PROD || CROSS_SITE_COOKIES;

export function setAuthCookies(res: Response, token: string): string {
  const csrfToken = randomBytes(24).toString('hex');

  res.cookie('as_access', token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE,
    maxAge: COOKIE_TTL_MS,
    path: '/',
  });

  res.cookie('as_csrf', csrfToken, {
    httpOnly: false, // JS-readable — intentional for double-submit pattern
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE,
    maxAge: COOKIE_TTL_MS,
    path: '/',
  });

  return csrfToken;
}

/** Refresh only the CSRF cookie (used by GET /auth/csrf on app load). */
export function setCsrfCookie(res: Response): string {
  const csrfToken = randomBytes(24).toString('hex');
  res.cookie('as_csrf', csrfToken, {
    httpOnly: false,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE,
    maxAge: COOKIE_TTL_MS,
    path: '/',
  });
  return csrfToken;
}

export function clearAuthCookies(res: Response): void {
  const opts = { path: '/', sameSite: COOKIE_SAME_SITE, secure: COOKIE_SECURE };
  res.clearCookie('as_access', opts);
  res.clearCookie('as_csrf', opts);
}
