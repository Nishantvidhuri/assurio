// RDS (Recrivio Design System) theme first — it pulls in Tailwind and defines
// the design tokens every shared/components/* class depends on. Our own
// stylesheets load after so page-level styles still win over Tailwind preflight.
import './rds.css';
import './globals.css';
import './epalify.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Plus_Jakarta_Sans } from 'next/font/google';
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

// Wordmark face — used only for the "Assurio" text beside the logo.
const logo = localFont({
  src: './fonts/Logoza.otf',
  display: 'swap',
  variable: '--font-logo',
});

export const metadata: Metadata = {
  title: 'Assurio — Background Verification',
  description:
    'Background screening for tenants, employees, caretakers, domestic workers, PG residents, drivers, and service professionals.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      {/* suppressHydrationWarning: browser extensions (ColorZilla, Grammarly,
       * LastPass…) inject attributes such as `cz-shortcut-listen` onto <body>
       * before React hydrates, which React reports as a hydration mismatch.
       * The warning is scoped to this element's attributes only — mismatches
       * in the tree below still surface normally. */}
      <body
        suppressHydrationWarning
        className={`${display.variable} ${logo.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
