'use client';
import PageLoader from '@/app/components/PageLoader';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Plus,
  Search,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  adminClient,
  adminCreditWallet,
  me,
  type AdminClientDetail,
  type AdminSubjectRow,
  type AuthUser,
} from '../../../lib/api';
import { getToken } from '../../../lib/session';
import { doLogout } from '../../../lib/logout';
import { ICONS, type SidebarItem } from '../../../components/Sidebar';
import AppShell from '../../../components/AppShell';
import { useAdminSwitchers } from '../../../components/useAdminSwitchers';
import InvoicesTab from './InvoicesTab';
import {
  FilterChip,
  Pagination,
  SearchBar,
  Button,
  Input,
  InputFieldWrapper,
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
  { href: '/admin/vendors', label: 'Vendors', icon: ICONS.vendors },
  { href: '/admin/packages', label: 'Packages', icon: ICONS.packages },
  { href: '/admin/operations', label: 'Operations', icon: ICONS.operations },
  { href: '/admin/test-verification', label: 'Test Verification', icon: ICONS.testVerification },
  { href: '/admin/whatsapp', label: 'WhatsApp', icon: ICONS.whatsapp },
];

/**
 * Status shown for a submitted candidate: "Completed" when all checks are done,
 * "In progress · X/Y" while some are still running (crime/credit take time),
 * else the raw account status.
 */
function checkProgressStatus(
  done: number,
  total: number,
  status: string,
  consentStatus?: string,
): { label: string; variant: 'Success' | 'Warning' | 'Failure' } {
  // Consent decides everything — a refused or unanswered case never ran a
  // check, so reporting progress against it would be misleading.
  if (consentStatus === 'DECLINED') return { label: 'Refused', variant: 'Failure' };
  if (consentStatus === 'EXPIRED') return { label: 'Expired', variant: 'Failure' };
  if (consentStatus === 'PENDING')
    return { label: 'Awaiting consent', variant: 'Warning' };
  if (total > 0) {
    if (done >= total) return { label: 'Completed', variant: 'Success' };
    return { label: `In progress · ${done}/${total}`, variant: 'Warning' };
  }
  if ((status || '').toLowerCase() === 'active')
    return { label: 'Active', variant: 'Success' };
  return { label: status || 'Invited', variant: 'Warning' };
}

/** Paise → "₹1,234.50". Formatting only ever happens at the edge; every
 *  amount in the system travels as integer paise. */
function formatRupees(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(paise / 100);
}

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


/**
 * Credit a client's wallet by hand.
 *
 * Amount is entered in rupees because that is what an operator thinks in, and
 * converted to integer paise here — the wire and the ledger only ever carry
 * paise. The requestId is minted once when the dialog opens, so a double
 * submit or a retry lands as one credit rather than two.
 */
function TopUpModal({
  clientName,
  balancePaise,
  error,
  busy,
  onCancel,
  onConfirm,
}: {
  clientName: string;
  balancePaise: number;
  error: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (amountPaise: number, note: string, requestId: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [requestId] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [busy, onCancel]);

  const rupees = Number(amount);
  const valid = Number.isFinite(rupees) && rupees >= 1 && rupees <= 200000;
  const amountBad = amount.trim() !== '' && !valid;
  const ready = valid && note.trim().length > 0;
  // Round at the boundary: 49.999 must not become 4999.9 paise.
  const paise = Math.round(rupees * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add money to wallet"
        className="w-full max-w-md overflow-hidden rounded-xl border border-border-default bg-white shadow-lg"
      >
        <div className="flex items-start gap-3 border-b border-border-default px-5 py-4">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-info text-primary">
            <Wallet size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-body-lg font-semibold text-text-heading">
              Add money to wallet
            </h2>
            <p className="mt-0.5 text-body-sm text-text-subheading">
              {clientName} · balance {formatRupees(balancePaise)}
            </p>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <InputFieldWrapper
            label="Amount (₹)"
            required
            error={amountBad ? 'Enter an amount between ₹1 and ₹2,00,000' : undefined}
          >
            <Input
              type="number"
              inputMode="decimal"
              min={1}
              max={200000}
              value={amount}
              placeholder="5000"
              disabled={busy}
              onChange={(e) => setAmount(e.target.value)}
            />
          </InputFieldWrapper>

          <InputFieldWrapper label="Reason" required>
            <Input
              value={note}
              placeholder="e.g. NEFT received 21 Aug, ref HDFC0001234"
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
            />
          </InputFieldWrapper>

          <div className="rounded-lg border border-border-warning bg-surface-warning px-4 py-2.5 text-body-sm text-warning-900">
            This credits real balance the client can spend on checks. The entry
            is permanent and recorded against your account.
          </div>

          {error && (
            <div className="rounded-lg border border-border-error bg-surface-error px-4 py-2.5 text-body-sm text-failure">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-default bg-neutral-100 px-5 py-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(paise, note.trim(), requestId)}
            disabled={busy || !ready}
            isLoading={busy}
          >
            {valid ? `Add ${formatRupees(paise)}` : 'Add money'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminClientPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [detail, setDetail] = useState<AdminClientDetail | null>(null);
  const [error, setError] = useState('');
  const { clientMenu } = useAdminSwitchers(params?.id);
  const [tab, setTab] = useState<'candidates' | 'invoices'>('candidates');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<'name' | 'status' | null>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // Manual wallet top-up (admin only).
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpBusy, setTopUpBusy] = useState(false);
  const [topUpError, setTopUpError] = useState('');

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

  async function handleTopUp(amountPaise: number, note: string, requestId: string) {
    const id = params?.id;
    if (!id) return;
    setTopUpBusy(true);
    setTopUpError('');
    try {
      const res = await adminCreditWallet(id, amountPaise, note, requestId);
      // Reflect the authoritative balance the ledger returned rather than
      // adding locally — if the request was a duplicate, nothing moved.
      setDetail((d) =>
        d
          ? { ...d, client: { ...d.client, walletBalancePaise: res.balancePaise } }
          : d,
      );
      setTopUpOpen(false);
    } catch (err) {
      setTopUpError(
        err instanceof Error ? err.message : 'Could not credit this wallet.',
      );
    } finally {
      setTopUpBusy(false);
    }
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

  if (!user) return <PageLoader />;

  return (
    <AppShell
      nav={ADMIN_NAV}
      user={user}
      onLogout={handleLogout}
      breadcrumbs={[
        { label: 'Home', href: '/admin' },
        { label: 'Clients', href: '/admin/clients' },
        { label: detail?.client.name ?? '…', menu: clientMenu },
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

            {/* ── Wallet ── */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-default bg-white px-5 py-4">
              <div>
                <div className="text-body-sm text-text-placeholder">
                  Wallet balance
                </div>
                <div className="mt-1 text-2xl font-semibold text-text-heading">
                  {formatRupees(detail.client.walletBalancePaise ?? 0)}
                </div>
              </div>
              <Button variant="secondary" onClick={() => setTopUpOpen(true)}>
                <Plus size={15} />
                Add money
              </Button>
            </div>

            {/* ── Tabs: Candidates | Invoices ── */}
            <div className="mb-2 flex items-center gap-1 border-b border-border-default">
              {(['candidates', 'invoices'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`-mb-px border-b-2 px-4 py-2.5 text-body-md font-medium capitalize transition-colors ${
                    tab === t
                      ? 'border-primary text-primary'
                      : 'border-transparent text-text-placeholder hover:text-text-body'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === 'invoices' && (
              <section className="mt-6">
                <InvoicesTab clientId={params?.id ?? ''} />
              </section>
            )}

            {tab === 'candidates' && (
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
                  {detail.drafts.length > 0 &&
                    ` · ${detail.drafts.length} draft${
                      detail.drafts.length === 1 ? '' : 's'
                    }`}
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
                    <TableHeaderCell label="Crime" className="cd-col-hide" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                      {/* In-progress drafts — shows what the client started and
                          which fields they've filled (✓) vs left blank (—). */}
                      {detail.drafts.map((d) => {
                        const dn =
                          (d.data.name || '').trim() || 'Untitled candidate';
                        const addressFilled = Boolean(
                          (d.data.permanentAddress || '').trim(),
                        );
                        return (
                          <TableRow
                            key={`draft-${d.id}`}
                            hoverable
                            className="cd-row cursor-pointer"
                            onClick={() =>
                              router.push(`/admin/draft/${d.id}`)
                            }
                          >
                            <TableCell
                              type="primary"
                              primaryText={dn}
                              subtext={
                                (d.data.email || '').trim() ||
                                'Draft — in progress'
                              }
                            />
                            <TableCell
                              className="cd-col-hide"
                              value={(d.data.role || '').trim() || '—'}
                            />
                            <TableCell
                              type="status"
                              statusLabel="Draft"
                              statusVariant="Default"
                            />
                            <TableCell
                              className="cd-col-hide"
                              value={
                                addressFilled ? (
                                  <span className="text-body-sm text-text-subheading">
                                    Filled
                                  </span>
                                ) : (
                                  <span className="text-text-placeholder">—</span>
                                )
                              }
                            />
                          </TableRow>
                        );
                      })}

                      {detail.subjects.length === 0 ? (
                        detail.drafts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center" value={<span className="text-text-placeholder">This client hasn&apos;t added any candidates yet.</span>} />
                          </TableRow>
                        ) : null
                      ) : filteredSubjects.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center" value={
                            <span className="text-text-placeholder">No candidates match <strong>&ldquo;{query}&rdquo;</strong>.</span>
                          } />
                        </TableRow>
                      ) : (
                        pagedSubjects.map((s) => {
                          const prog = checkProgressStatus(
                            s.checksDone ?? 0,
                            s.checksTotal ?? 0,
                            s.status,
                            s.consentStatus,
                          );
                          return (
                          <TableRow
                            key={s.id}
                            hoverable
                            className="cursor-pointer"
                            onClick={() => router.push(`/admin/subject/${s.id}`)}
                          >
                            <TableCell
                              type="primary"
                              primaryText={s.name}
                              subtext={s.email}
                              onPrimaryClick={() => router.push(`/admin/subject/${s.id}`)}
                            />
                            <TableCell className="cd-col-hide" value={s.role || '—'} />
                            <TableCell
                              type="status"
                              statusLabel={prog.label}
                              statusVariant={prog.variant}
                            />
                            <TableCell
                              className="cd-col-hide"
                              value={
                                s.crimeRisk ? (
                                  <span className={`badge ${riskClassBadge(s.crimeRisk)}`}>{s.crimeRisk}</span>
                                ) : (
                                  <span className="text-text-placeholder">
                                    {/* Never promise a result for a check that
                                        isn't in scope — a candidate with no
                                        address, DOB or father's name has
                                        nothing to await, and pairing it with a
                                        "Completed" status reads as a stall. */}
                                    {s.crimeApplicable === false
                                      ? '—'
                                      : s.crimeFailed
                                        ? 'Unable to verify'
                                        : s.crimeSettled
                                          ? 'Report ready'
                                          : s.consentStatus === 'DECLINED' ||
                                              s.consentStatus === 'EXPIRED'
                                            ? 'Not run'
                                            : s.consentStatus === 'PENDING'
                                              ? 'Awaiting consent'
                                              : 'Awaiting result'}
                                  </span>
                                )
                              }
                            />
                          </TableRow>
                          );
                        })
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
            )}
          </>
        )}

        {topUpOpen && detail && (
          <TopUpModal
            clientName={detail.client.name}
            balancePaise={detail.client.walletBalancePaise ?? 0}
            error={topUpError}
            busy={topUpBusy}
            onCancel={() => setTopUpOpen(false)}
            onConfirm={(paise, note, requestId) =>
              void handleTopUp(paise, note, requestId)
            }
          />
        )}
      </AppShell>
  );
}
