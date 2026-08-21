'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Globe } from 'lucide-react';
import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_LABELS,
  type Locale,
} from '../lib/locale';

/**
 * Language override.
 *
 * Writes the choice to a cookie and refreshes, rather than swapping messages
 * client-side: the locale is resolved during server rendering, so a refresh is
 * what makes the *next* first paint correct too. Without it the choice would
 * hold for this page and silently revert on the next navigation.
 *
 * Rendered as native <select> on purpose. This appears on the candidate flow,
 * often on a cheap Android phone, and the OS picker is the control that
 * already works there — bigger tap targets, native scrolling, no custom
 * dropdown to fight with.
 */
export default function LanguageSwitcher({
  className = '',
}: {
  className?: string;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('language');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: string) {
    // Lax, not Strict: the candidate arrives from a link in WhatsApp or email,
    // and a Strict cookie is withheld on that first cross-site navigation —
    // which is the one page where the language matters most.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <label className={`inline-flex items-center gap-1.5 ${className}`}>
      {/* The globe is decoration — the option text already says what the
          control is, in the language it selects. Dropped below sm, where the
          top bar has a logo, wallet balance and avatar competing for width. */}
      <Globe
        className="hidden size-4 shrink-0 text-text-subheading sm:block"
        aria-hidden
      />
      <span className="sr-only">{t('switch')}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => choose(e.target.value)}
        className="max-w-[7.5rem] rounded-md border border-border-default bg-white px-2 py-1.5 text-body-sm text-text-body disabled:opacity-60"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
