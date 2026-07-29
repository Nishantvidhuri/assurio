'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Search,
  Users,
  X,
} from 'lucide-react';
import {
  adminClient,
  me,
  type AdminClientDetail,
  type AdminSubjectRow,
  type AuthUser,
} from '../../../lib/api';
import { getToken } from '../../../lib/session';
import { doLogout } from '../../../lib/logout';
import { ICONS, type SidebarItem } from '../../../components/Sidebar';
import AppShell from '../../../components/AppShell';
import {
  FilterChip,
  Pagination,
  SearchBar,
  Tag,
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
];

function riskClassBadge(risk?: string | null): string {
  const r = (risk || '').toLowerCase();
  if (r.includes('no risk')) return 'risk-no';
  if (r.includes('low')) return 'risk-low';
  if (r.includes('medium') || r.includes('moderate')) return 'risk-medium';
  if (r.includes('high') || r.includes('serious') || r.includes('critical'))
    return 'risk-high';
  return 'risk-no';
}

function riskClass(risk?: string | null): string {
  const r = (risk || '').toLowerCase();
  if (r.includes('no risk')) return 'risk-no';
  if (r.includes('low')) return 'risk-low';
  if (r.includes('medium') || r.includes('moderate')) return 'risk-medium';
  if (r.includes('high') || r.includes('serious') || r.includes('critical'))
    return 'risk-high';
  return 'risk-no';
}

export default function AdminClientPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [detail, setDetail] = useState<AdminClientDetail | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<'name' | 'status' | null>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  function toggleSort(key: 'name' | 'status') {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

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
        const d = await adminClient(token, id);
        if (cancelled) return;
        setDetail(d);
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
  }, [params, router]);

  function handleLogout() {
    doLogout(router);
  }

  const filteredSubjects = useMemo(() => {
    if (!detail) return [];
    const q = query.trim().toLowerCase();
    return detail.subjects.filter((s) => {
      if (statusFilter.length > 0 && !statusFilter.includes(s.status)) return false;
      if (!q) return true;
      return [s.name, s.email, s.role, s.status].join(' ').toLowerCase().includes(q);
    });
  }, [detail, query, statusFilter]);

  const sortedSubjects = useMemo(() => {
    if (!sortKey) return filteredSubjects;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filteredSubjects].sort((a, b) =>
      sortKey === 'name'
        ? dir * (a.name || '').localeCompare(b.name || '')
        : dir * (a.status || '').localeCompare(b.status || ''),
    );
  }, [filteredSubjects, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedSubjects.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedSubjects = useMemo(
    () => sortedSubjects.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sortedSubjects, currentPage, pageSize],
  );

  const allPagedSelected =
    pagedSubjects.length > 0 && pagedSubjects.every((x) => selected.has(x.id));
  const somePagedSelected = pagedSubjects.some((x) => selected.has(x.id));

  function toggleSelectAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const x of pagedSubjects) {
        if (checked) next.add(x.id);
        else next.delete(x.id);
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
    <AppShell
      nav={ADMIN_NAV}
      user={user}
      onLogout={handleLogout}
      breadcrumbs={[
        { label: 'Home', href: '/admin' },
        { label: 'Clients', href: '/admin/clients' },
        { label: detail?.client.name ?? '…' },
      ]}
    >
        {error && <div className="error">{error}</div>}

        {detail && (
          <>
            {/* ── Recriauth-style page header: back + name + status ── */}
            <header className="mb-4 flex items-center gap-3">
              <Link
                href="/admin/clients"
                aria-label="Back to clients"
                className="flex h-8 w-8 items-center justify-center rounded-md text-text-body hover:bg-neutral-300"
              >
                <ArrowLeft size={18} />
              </Link>
              <h1 className="text-xl font-semibold text-text-heading">
                {detail.client.name}
              </h1>
              <Tag label="Active" variant="Success" />
              <span className="ml-2 hidden text-body-md text-text-placeholder sm:inline">
                {detail.client.email}
              </span>
            </header>

            <section className="mt-6">
              <h2 className="mb-3 text-lg font-semibold text-text-heading">Candidates</h2>

              {/* ── Filters row ── */}
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="text-body-md text-text-placeholder">Filters:</span>
                <FilterChip
                  label="Status"
                  options={[
                    { value: 'invited', label: 'Invited' },
                    { value: 'active', label: 'Active' },
                  ]}
                  selectedValues={statusFilter}
                  onSelectionChange={setStatusFilter}
                />
              </div>

              {/* ── Showing count left, search right ── */}
              <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
                <p className="text-body-sm text-text-placeholder">
                  Showing {pagedSubjects.length} out of {sortedSubjects.length}
                </p>
                <div className="w-full sm:w-[280px]">
                  <SearchBar
                    value={query}
                    onChange={setQuery}
                    placeholder="Search"
                  />
                </div>
              </div>

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
                      label="Candidate"
                      sortable
                      sortOrder={sortKey === 'name' ? sortDir : null}
                      onSort={() => toggleSort('name')}
                    />
                    <TableHeaderCell label="Role" className="cd-col-hide" />
                    <TableHeaderCell
                      label="Status"
                      sortable
                      sortOrder={sortKey === 'status' ? sortDir : null}
                      onSort={() => toggleSort('status')}
                    />
                    <TableHeaderCell label="PAN" className="cd-col-hide" />
                    <TableHeaderCell label="Aadhaar" className="cd-col-hide" />
                    <TableHeaderCell label="Crime" className="cd-col-hide" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                      {detail.subjects.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center" value={<span className="text-text-placeholder">This client hasn&apos;t added any candidates yet.</span>} />
                        </TableRow>
                      ) : filteredSubjects.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center" value={
                            <span className="text-text-placeholder">No candidates match <strong>&ldquo;{query}&rdquo;</strong>.</span>
                          } />
                        </TableRow>
                      ) : (
                        pagedSubjects.map((s) => (
                          <TableRow
                            key={s.id}
                            hoverable
                            className="cursor-pointer"
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest('input,label')) return;
                              router.push(`/admin/subject/${s.id}`);
                            }}
                          >
                            <TableCell
                              type="checkbox"
                              checked={selected.has(s.id)}
                              onCheckedChange={(checked) => toggleSelect(s.id, checked)}
                            />
                            <TableCell
                              type="primary"
                              primaryText={s.name}
                              subtext={s.email}
                              onPrimaryClick={() => router.push(`/admin/subject/${s.id}`)}
                            />
                            <TableCell className="cd-col-hide" value={s.role || '—'} />
                            <TableCell
                              type="status"
                              statusLabel={s.status}
                              statusVariant={s.status === 'active' ? 'Success' : 'Warning'}
                            />
                            <TableCell
                              className="cd-col-hide"
                              value={s.hasPan ? <CheckCircle2 size={14} className="cd-check" /> : '—'}
                            />
                            <TableCell
                              className="cd-col-hide"
                              value={s.hasAadhaar ? <CheckCircle2 size={14} className="cd-check" /> : '—'}
                            />
                            <TableCell
                              className="cd-col-hide"
                              value={
                                s.crimeRisk ? (
                                  <span className={`badge ${riskClassBadge(s.crimeRisk)}`}>{s.crimeRisk}</span>
                                ) : (
                                  <span className="text-text-placeholder">not started</span>
                                )
                              }
                            />
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
            </section>
          </>
        )}
      </AppShell>
  );
}
