import { cookies, headers } from 'next/headers';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  matchLocale,
  parseAcceptLanguage,
  type Locale,
} from './locale';

/**
 * The locale for this request, resolved server-side so the first paint is
 * already in the right language.
 *
 * Order matters: an explicit choice always beats detection. Someone who picked
 * English on a Hindi phone means it, and re-detecting on every request would
 * quietly undo them.
 *
 *   1. the cookie set by the language switcher
 *   2. the browser's Accept-Language header
 *   3. English
 */
export async function resolveLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;

  const accept = (await headers()).get('accept-language');
  const detected = matchLocale(parseAcceptLanguage(accept));
  return detected || DEFAULT_LOCALE;
}

/** Load one catalog. Kept narrow so the bundle only ever carries one. */
export async function loadMessages(
  locale: Locale,
): Promise<Record<string, unknown>> {
  const mod = await import(`../../messages/${locale}.json`);
  return mod.default as Record<string, unknown>;
}
