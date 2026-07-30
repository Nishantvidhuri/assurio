'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminMonthly,
  me,
  type AdminMonthly,
  type AuthUser,
} from '../lib/api';
import { getToken } from '../lib/session';
import { doLogout } from '../lib/logout';
import { ICONS, type SidebarItem } from '../components/Sidebar';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';

const ADMIN_NAV: SidebarItem[] = [
  { href: '/admin', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/admin/clients', label: 'Clients', icon: ICONS.clients },
  { href: '/admin/invoices', label: 'Invoices', icon: ICONS.invoices },
  { href: '/admin/operations', label: 'Operations', icon: ICONS.operations },
  { href: '/admin/vendors', label: 'Vendors', icon: ICONS.vendors },
  { href: '/admin/test-verification', label: 'Test Verification', icon: ICONS.testVerification },
];

function monthName(): string {
  return new Date().toLocaleString('en-US', { month: 'long' });
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function rupees(n: number): string {
  return '₹' + n.toLocaleString();
}

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [monthly, setMonthly] = useState<AdminMonthly | null>(null);
  const [error, setError] = useState('');

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
        const m = await adminMonthly(token);
        if (cancelled) return;
        setMonthly(m);
      } catch (err) {
        if (cancelled) return;
        if (
          err instanceof Error &&
          /401|expired|invalid|token/i.test(err.message)
        ) {
          doLogout(router);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleLogout() {
    doLogout(router);
  }

  if (!user) return <div className="loading">Loading...</div>;

  const cards = [
    {
      label: 'Checks this month',
      value: fmt(monthly?.checksThisMonth ?? 0),
    },
    {
      label: 'Clients added this month',
      value: fmt(monthly?.clientsThisMonth ?? 0),
    },
    {
      label: 'Money earned this month',
      value: rupees(monthly?.earningsThisMonth ?? 0),
    },
    {
      label: 'Checks done this month',
      value: fmt(monthly?.checksDoneThisMonth ?? 0),
    },
  ];

  return (
    <AppShell nav={ADMIN_NAV} user={user} onLogout={handleLogout}>
      <div className="dash">
        <div className="dash-head">
          <div>
            <h1 className="dash-title">Dashboard</h1>
            <p className="dash-sub">
              Overview for {monthName()} {new Date().getFullYear()}.
            </p>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((c) => (
            <StatCard key={c.label} label={c.label} value={c.value} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
