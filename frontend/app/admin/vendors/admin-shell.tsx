'use client';

/**
 * Admin gate + AppShell for the ported Vendor Management routes.
 *
 * In Recriauth these pages sit under app/dashboard/internal/, whose layout
 * supplies the dashboard chrome. Assurio has no equivalent parent layout for
 * /admin, so each page normally does the me() gate itself — this wrapper does
 * it once for every /admin/vendors route, keeping the ported pages untouched.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { me, type AuthUser } from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import { ICONS, type SidebarItem } from '../../components/Sidebar';
import AppShell from '../../components/AppShell';

const ADMIN_NAV: SidebarItem[] = [
  { href: '/admin', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/admin/clients', label: 'Clients', icon: ICONS.clients },
  { href: '/admin/invoices', label: 'Invoices', icon: ICONS.invoices },
  { href: '/admin/operations', label: 'Operations', icon: ICONS.operations },
  { href: '/admin/vendors', label: 'Vendors', icon: ICONS.vendors },
  { href: '/admin/test-verification', label: 'Test Verification', icon: ICONS.testVerification },
];

export default function AdminVendorsShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const u = await me(token);
        if (cancelled) return;
        if (u.role !== 'admin') {
          router.replace('/home');
          return;
        }
        setUser(u);
      } catch {
        if (!cancelled) doLogout(router);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!user) return <div className="loading">Loading...</div>;

  return (
    <AppShell
      nav={ADMIN_NAV}
      user={user}
      onLogout={() => doLogout(router)}
      breadcrumbs={[{ label: 'Home', href: '/admin' }, { label: 'Vendors' }]}
    >
      {children}
    </AppShell>
  );
}
