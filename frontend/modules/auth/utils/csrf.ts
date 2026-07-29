const CSRF_COOKIE_NAME = process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? 'ra_csrf';

export function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookies = document.cookie.split(';');
  for (const item of cookies) {
    const [key, ...rest] = item.trim().split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return null;
}

export function getCsrfTokenFromCookie(): string | null {
  return getCookieValue(CSRF_COOKIE_NAME);
}
