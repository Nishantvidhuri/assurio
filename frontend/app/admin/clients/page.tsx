'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminClients,
  me,
  type AdminClientRow,
  type AuthUser,
} from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import { ICONS, type SidebarItem } from '../../components/Sidebar';
import AppShell from '../../components/AppShell';
import {
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@/shared/components/ui';

const ADMIN_NAV: SidebarItem[] = [
  { href: '/admin', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/admin/clients', label: 'Clients', icon: ICONS.clients },
  { href: '/admin/invoices', label: 'Invoices', icon: ICONS.invoices },
  { href: '/admin/operations', label: 'Operations', icon: ICONS.operations },
  { href: '/admin/vendors', label: 'Vendors', icon: ICONS.vendors },
  { href: '/admin/test-verification', label: 'Test Verification', icon: ICONS.testVerification },
];

export default function AdminClientsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [clients, setClients] = useState<AdminClientRow[]>([]);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'candidates' | null>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  function toggleSort(key: 'name' | 'candidates') {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return clients;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...clients].sort((a, b) =>
      sortKey === 'name'
        ? dir * (a.name || '').localeCompare(b.name || '')
        : dir * (a.candidateCount - b.candidateCount),
    );
  }, [clients, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sorted, currentPage, pageSize],
  );

  const allPagedSelected = paged.length > 0 && paged.every((c) => selected.has(c.id));
  const somePagedSelected = paged.some((c) => selected.has(c.id));

  function toggleSelectAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of paged) {
        if (checked) next.add(c.id);
        else next.delete(c.id);
      }
      return next;
    });
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  if (!user) return <div className="loading">Loading...</div>;

  return (
    <AppShell nav={ADMIN_NAV} user={user} onLogout={handleLogout}>
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

      <p className="mb-2 text-body-sm text-text-placeholder">
        Showing {paged.length} out of {sorted.length}
      </p>
      <Table bordered className="bg-white">
        <TableHeader>
          <TableRow>
            <TableHeaderCell
              type="checkbox"
              checked={allPagedSelected}
              indeterminate={!allPagedSelected && somePagedSelected}
              onCheckedChange={toggleSelectAll}
            />
            <TableHeaderCell
              label="Client"
              sortable
              sortOrder={sortKey === 'name' ? sortDir : null}
              onSort={() => toggleSort('name')}
            />
            <TableHeaderCell label="Email" className="cd-col-hide" />
            <TableHeaderCell
              label="Candidates"
              sortable
              sortOrder={sortKey === 'candidates' ? sortDir : null}
              onSort={() => toggleSort('candidates')}
            />
            <TableHeaderCell type="empty" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center"
                value={<span className="text-text-placeholder">No clients yet.</span>}
              />
            </TableRow>
          ) : (
            paged.map((c) => (
              <TableRow
                key={c.id}
                hoverable
                className="cursor-pointer"
                onClick={(e) => {
                  // Checkbox clicks toggle selection — not navigation.
                  if ((e.target as HTMLElement).closest('input,label')) return;
                  router.push(`/admin/client/${c.id}`);
                }}
              >
                <TableCell
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onCheckedChange={(checked) => toggleSelect(c.id, checked)}
                />
                <TableCell
                  type="primary"
                  primaryText={c.name}
                  showSubtext={false}
                  onPrimaryClick={() => router.push(`/admin/client/${c.id}`)}
                />
                <TableCell className="cd-col-hide" value={c.email} />
                <TableCell value={c.candidateCount} />
                <TableCell value={<span className="text-text-placeholder">›</span>} />
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <div className="mt-3">
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(size: number) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>
    </AppShell>
  );
}
