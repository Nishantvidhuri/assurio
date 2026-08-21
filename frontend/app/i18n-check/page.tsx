import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import LanguageSwitcher from '../components/LanguageSwitcher';

/**
 * Development-only scaffold for the translation pipeline.
 *
 * Exists so the language switcher, browser detection, the three catalogs and
 * the Devanagari/Kannada fonts can be checked together before hundreds of
 * strings are migrated onto them. 404s in production — an unauthenticated
 * route that renders raw catalog contents has no business being reachable
 * once this ships.
 */
export default async function I18nCheck() {
  if (process.env.NODE_ENV === 'production') notFound();

  const t = await getTranslations();
  const samples: Array<[string, string]> = [
    ['consent.title', t('consent.title')],
    ['consent.subtitle', t('consent.subtitle', { client: 'Northwind Labs' })],
    ['consent.whatWeCheck', t('consent.whatWeCheck')],
    ['consent.agree', t('consent.agree')],
    ['consent.decline', t('consent.decline')],
    ['consent.continue', t('consent.continue')],
    ['common.checksDone', t('common.checksDone', { done: 3, total: 7 })],
    ['common.back', t('common.back')],
    ['common.next', t('common.next')],
    ['common.submit', t('common.submit')],
    ['common.cancel', t('common.cancel')],
    ['common.loading', t('common.loading')],
  ];

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-heading">
            Translation check
          </h1>
          <p className="mt-1 text-body-sm text-text-subheading">
            Switch language, or set your browser/phone language and reload.
          </p>
        </div>
        <LanguageSwitcher />
      </div>

      <div className="overflow-hidden rounded-xl border border-border-default bg-white">
        {samples.map(([key, value], i) => (
          <div
            key={key}
            className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 ${
              i > 0 ? 'border-t border-border-default' : ''
            }`}
          >
            <code className="w-56 shrink-0 text-body-sm text-text-placeholder">
              {key}
            </code>
            <span className="text-body-md text-text-heading">{value}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-body-sm text-text-placeholder">
        A value showing as its own key name means that key is missing from this
        catalog.
      </p>
    </main>
  );
}
