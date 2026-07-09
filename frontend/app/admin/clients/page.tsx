'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminClients,
  me,
  type AdminClientRow,
  type AuthUser,
} from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import Sidebar, { ICONS, type SidebarItem } from '../../components/Sidebar';

const ADMIN_NAV: SidebarItem[] = [
  { href: '/admin', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/admin/clients', label: 'Clients', icon: ICONS.clients },
  { href: '/admin/invoices', label: 'Invoices', icon: ICONS.invoices },
  { href: '/admin/whatsapp', label: 'WhatsApp', icon: ICONS.whatsapp },
  { href: '/admin/operations', label: 'Operations', icon: ICONS.operations },
];

export default function AdminClientsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [clients, setClients] = useState<AdminClientRow[]>([]);
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
        const c = await adminClients(token);
        if (cancelled) return;
        setClients(c);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && /401|expired|invalid|token/i.test(err.message)) {
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

  return (
    <div className="shell">
      <Sidebar items={ADMIN_NAV} user={user} onLogout={handleLogout} />
      <main className="shell-main">
        <div className="shell-head">
          <div>
            <h1 className="page-title">Clients</h1>
            <p className="page-sub">
              Every client on Assurio. Open one to see their candidates and
              wallet history.
            </p>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Client</th>
                <th className="cd-col-hide">Email</th>
                <th className="cd-col-hide">Candidates</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={4} className="adm-empty">
                    No clients yet.
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr
                    key={c.id}
                    className="adm-row"
                    onClick={() => router.push(`/admin/client/${c.id}`)}
                  >
                    <td>
                      <div className="adm-name">{c.name}</div>
                      <div className="adm-mob-sub">
                        <span>{c.email}</span>
                        <span className="adm-mob-sep">·</span>
                        <span>{c.candidateCount} candidate{c.candidateCount === 1 ? '' : 's'}</span>
                      </div>
                    </td>
                    <td className="cd-col-hide">{c.email}</td>
                    <td className="cd-col-hide">{c.candidateCount}</td>
                    <td className="adm-arrow">›</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
