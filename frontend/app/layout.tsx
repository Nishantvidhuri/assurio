// RDS (Recrivio Design System) theme first — it pulls in Tailwind and defines
// the design tokens every shared/components/* class depends on. Our own
// stylesheets load after so page-level styles still win over Tailwind preflight.
import './rds.css';
import './globals.css';
import './epalify.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import DocumentTitle from './components/DocumentTitle';
import { NextIntlClientProvider } from 'next-intl';
import { loadMessages, resolveLocale } from './lib/i18n-server';
import {
  Noto_Sans_Devanagari,
  Noto_Sans_Kannada,
  Plus_Jakarta_Sans,
} from 'next/font/google';
import localFont from 'next/font/local';

// RDS primary sans (variable weight 200–800). Exposed as --font-manrope, which
// the RDS theme maps onto --font-sans, making it the app-wide body font.
const manrope = localFont({
  src: '../public/font/Manrope-VariableFont_wght.ttf',
  weight: '200 800',
  display: 'swap',
  variable: '--font-manrope',
});

const display = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

/**
 * Indic faces. Manrope covers no Devanagari or Kannada glyphs, so Hindi and
 * Kannada would render as fallback or tofu boxes without these.
 *
 * preload: false is deliberate — the vast majority of page views are English
 * and would otherwise pay ~250 KB per script for fonts they never draw. The
 * browser fetches them only when text actually needs those glyphs.
 */
const devanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
  variable: '--font-devanagari',
});

const kannada = Noto_Sans_Kannada({
  subsets: ['kannada'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
  variable: '--font-kannada',
});

// Wordmark face — used only for the "Recrify" text beside the logo.
const logo = localFont({
  src: './fonts/Rosehot.ttf',
  display: 'swap',
  variable: '--font-logo',
});

export const metadata: Metadata = {
  title: 'Recrify — Background Verification',
  description:
    'Background screening for tenants, employees, caretakers, domestic workers, PG residents, drivers, and service professionals.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Resolved on the server so the first paint is already in the right
  // language — detecting after hydration would flash English at exactly the
  // person who cannot read it.
  const locale = await resolveLocale();
  const messages = await loadMessages(locale);

  return (
    <html
      lang={locale}
      className={`${manrope.variable} ${devanagari.variable} ${kannada.variable}`}
    >
      {/* suppressHydrationWarning: browser extensions (ColorZilla, Grammarly,
       * LastPass…) inject attributes such as `cz-shortcut-listen` onto <body>
       * before React hydrates, which React reports as a hydration mismatch.
       * The warning is scoped to this element's attributes only — mismatches
       * in the tree below still surface normally. */}
      <body
        suppressHydrationWarning
        className={`${display.variable} ${logo.variable}`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <DocumentTitle />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
