'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const BASE = 'Recrify';
const DEFAULT_TITLE = 'Recrify — Background Verification';

/**
 * Route → tab-title label. Longest matching prefix wins, so specific routes
 * (e.g. /home/new/checkout) beat their parents (/home). Dynamic segments like
 * /subject/[id] match by prefix.
 */
const ROUTE_TITLES: [string, string][] = [
  ['/login', 'Log in'],
  ['/register', 'Sign up'],
  ['/home/new/checkout', 'Checkout'],
  ['/home/new/success', 'Payment successful'],
  ['/home/new', 'New verification'],
  ['/home/billing', 'Billing'],
  ['/home/settings', 'Settings'],
  ['/home', 'Your candidates'],
  ['/subject', 'Candidate'],
  ['/admin/clients/new/checkout', 'Checkout'],
  ['/admin/clients/new/success', 'Payment successful'],
  ['/admin/clients/new', 'New client'],
  ['/admin/clients', 'Clients'],
  ['/admin/client', 'Client'],
  ['/admin/subject', 'Candidate'],
  ['/admin/draft', 'Draft'],
  ['/admin/invoices', 'Invoices'],
  ['/admin/operations', 'Operations'],
  ['/admin/vendors', 'Vendors'],
  ['/admin/packages', 'Packages'],
  ['/admin/test-verification', 'Test verification'],
  ['/admin', 'Admin dashboard'],
];

function titleFor(pathname: string): string {
  let best: string | null = null;
  let bestLen = -1;
  for (const [prefix, label] of ROUTE_TITLES) {
    if (
      (pathname === prefix || pathname.startsWith(prefix + '/')) &&
      prefix.length > bestLen
    ) {
      best = label;
      bestLen = prefix.length;
    }
  }
  return best ? `${best} · ${BASE}` : DEFAULT_TITLE;
}

/** Keeps the browser tab title in sync with the current route. */
export default function DocumentTitle() {
  const pathname = usePathname();
  useEffect(() => {
    document.title = titleFor(pathname || '/');
  }, [pathname]);
  return null;
}
