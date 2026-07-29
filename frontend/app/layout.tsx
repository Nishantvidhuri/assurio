import './globals.css';
import './epalify.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import localFont from 'next/font/local';

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

const sans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Assurio — Background Verification',
  description:
    'Background screening for tenants, employees, caretakers, domestic workers, PG residents, drivers, and service professionals.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${sans.variable} ${logo.variable}`}>
        {children}
      </body>
    </html>
  );
}
