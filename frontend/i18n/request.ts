import { getRequestConfig } from 'next-intl/server';
import { loadMessages, resolveLocale } from '../app/lib/i18n-server';

/**
 * next-intl's per-request hook. Registered via the plugin in next.config.js.
 *
 * We deliberately do NOT use next-intl's routing: adding a [locale] segment
 * would change every URL in the product, including the verify links already
 * sent to candidates over WhatsApp and the origins registered with Google and
 * Surepass. The locale lives in a cookie instead, resolved here.
 */
export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return { locale, messages: await loadMessages(locale) };
});
