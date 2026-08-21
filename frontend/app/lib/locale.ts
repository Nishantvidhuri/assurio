/**
 * The three languages the product speaks.
 *
 * Chosen by browser detection on first visit and overridable from a switcher;
 * the choice is stored in a cookie (not localStorage) so the server rendering
 * the page can read it too — otherwise every page would flash English before
 * hydrating into the user's language.
 */
export const LOCALES = ['en', 'hi', 'kn'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Shown in the language switcher, in the language itself — someone looking
 *  for Kannada is looking for "ಕನ್ನಡ", not for "Kannada". */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  hi: 'हिंदी',
  kn: 'ಕನ್ನಡ',
};

export const LOCALE_COOKIE = 'recrify_locale';
/** A year: the language someone reads in does not change week to week. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/**
 * Best supported match for a browser/Accept-Language preference list.
 *
 * Matches on the primary subtag so "hi-IN" and "hi" both land on Hindi, and
 * walks the list in order so a phone set to [kn-IN, en-IN] gets Kannada rather
 * than the first thing we happen to support. Falls back to English.
 */
export function matchLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const primary = tag.trim().toLowerCase().split('-')[0];
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}

/** Parse an Accept-Language header into an ordered list of tags, honouring q. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='));
      return { tag: tag.trim(), q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((x) => x.tag && Number.isFinite(x.q))
    .sort((a, b) => b.q - a.q)
    .map((x) => x.tag);
}
