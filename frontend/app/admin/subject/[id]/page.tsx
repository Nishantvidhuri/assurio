'use client';
import PageLoader from '@/app/components/PageLoader';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  adminSubject,
  me,
  type AdminSubjectDetail,
  type AuthUser,
} from '../../../lib/api';
import { getToken } from '../../../lib/session';
import { doLogout } from '../../../lib/logout';
import { ICONS, type SidebarItem } from '../../../components/Sidebar';
import AppShell from '../../../components/AppShell';
import SubjectReport from '../../../components/SubjectReport';
import { useAdminSwitchers } from '../../../components/useAdminSwitchers';

const ADMIN_NAV: SidebarItem[] = [
  { href: '/admin', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/admin/clients', label: 'Clients', icon: ICONS.clients },
  { href: '/admin/invoices', label: 'Invoices', icon: ICONS.invoices },
  { href: '/admin/vendors', label: 'Vendors', icon: ICONS.vendors },
  { href: '/admin/packages', label: 'Packages', icon: ICONS.packages },
  { href: '/admin/operations', label: 'Operations', icon: ICONS.operations },
  { href: '/admin/test-verification', label: 'Test Verification', icon: ICONS.testVerification },
];

export default function AdminSubjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [subject, setSubject] = useState<AdminSubjectDetail | null>(null);
  const [error, setError] = useState('');
  const { clientMenu, candidateMenu } = useAdminSwitchers(
    subject?.ownerId,
    subject?.id,
  );

  useEffect(() => {
    const id = params?.id;
    if (!id) return;
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
        const s = await adminSubject(token, id);
        if (cancelled) return;
        setSubject(s);
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
  }, [params, router]);

  useEffect(() => {
    const id = params?.id;
    if (!id || !user) return;
    const token = getToken();
    if (!token) return;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const es = new EventSource(`${API_URL}/subjects/${id}/events`, { withCredentials: true });
    es.onmessage = (e: MessageEvent) => {
      try { setSubject(JSON.parse(e.data as string)); } catch { /* ignore */ }
    };
    return () => es.close();
  }, [params, user]);

  function handleLogout() {
    doLogout(router);
  }

  if (!user) {
    return <PageLoader />;
  }

  if (error) {
    return (
      <AppShell nav={ADMIN_NAV} user={user} onLogout={handleLogout}>
          <div className="error">{error}</div>
          <Link className="back-link" href="/admin/clients">
            ← Back to clients
          </Link>
        </AppShell>
    );
  }

  if (!subject) {
    return <PageLoader />;
  }

  return (
    <AppShell
      nav={ADMIN_NAV}
      user={user}
      onLogout={handleLogout}
      breadcrumbs={[
        { label: 'Home', href: '/admin' },
        { label: 'Clients', href: '/admin/clients' },
        ...(subject.ownerId
          ? [
              {
                label: subject.clientName || 'Client',
                href: `/admin/client/${subject.ownerId}`,
                menu: clientMenu,
              },
            ]
          : []),
        { label: subject.name, menu: candidateMenu },
      ]}
    >
        {/* Same verification report the client sees — read-only (no Refresh). */}
        <SubjectReport
          subject={subject}
          admin
          onBack={() =>
            router.push(
              subject.ownerId
                ? `/admin/client/${subject.ownerId}`
                : '/admin/clients',
            )
          }
          onSubjectUpdate={(u) =>
            setSubject((prev) =>
              prev ? ({ ...prev, ...u } as AdminSubjectDetail) : prev,
            )
          }
        />
      </AppShell>
  );
}
