'use client';
import PageLoader from '@/app/components/PageLoader';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  FileText,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  listSubjects,
  me,
  type AuthUser,
  type Subject,
} from '../lib/api';
import { getToken } from '../lib/session';
import { doLogout } from '../lib/logout';
import { CLIENT_NAV } from '../components/Sidebar';
import AppShell from '../components/AppShell';
import {
  listServerDrafts,
  deleteServerDraft,
  type DraftSummary,
} from './new/server-draft';
import {
  Button,
  Pagination,
  SearchBar,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  type StatusVariant,
} from '@/shared/components/ui';


function riskClassMini(risk?: string): string {
  const r = (risk || '').toLowerCase();
  if (r.includes('no risk')) return 'risk-no';
  if (r.includes('low')) return 'risk-low';
  if (r.includes('medium') || r.includes('moderate')) return 'risk-medium';
  if (r.includes('high') || r.includes('serious') || r.includes('critical'))
    return 'risk-high';
  return 'risk-no';
}

function getCrimeRisk(s: Subject): string | undefined {
  const data = (s.crimeResult as { data?: { risk_assessment?: { risk_type?: string } } } | null)
    ?.data;
  return data?.risk_assessment?.risk_type;
}

/**
 * The one status rule for a candidate — used by BOTH the desktop table row and
 * the mobile card, so the two can never disagree.
 *
 * Consent outcome wins (those cases are closed and already refunded). Otherwise
 * it reports progress across ALL applicable checks, from the same server-computed
 * count the report shows. It deliberately does NOT say "Completed" just because
 * some result exists — that was the old mobile rule, which showed Completed at 5/7.
 */
function subjectStatusChip(s: Subject): { label: string; variant: StatusVariant } {
  if (s.consentStatus === 'DECLINED') return { label: 'Refused', variant: 'Failure' };
  if (s.consentStatus === 'EXPIRED') return { label: 'Expired', variant: 'Failure' };
  if (s.consentStatus === 'PENDING')
    return { label: 'Awaiting consent', variant: 'Warning' };

  const done = s.progress?.done ?? 0;
  const total = s.progress?.total ?? 0;
  if (total > 0 && done >= total) return { label: 'Completed', variant: 'Success' };
  if (done > 0)
    return { label: `In progress · ${done}/${total}`, variant: 'Warning' };
  return {
    label: s.status || 'invited',
    variant: s.status === 'active' ? 'Success' : 'Warning',
  };
}

// Text colour for the mobile card, mirroring the RDS chip variants above.
const STATUS_TEXT_CLASS: Record<StatusVariant, string> = {
  Success: 'text-success',
  Warning: 'text-warning',
  Failure: 'text-failure',
  Default: 'text-text-subheading',
  Primary: 'text-primary',
};

// Maps a crime-risk label onto an RDS status-chip variant.
function crimeVariant(risk: string): StatusVariant {
  const r = risk.toLowerCase();
  if (r.includes('high') || r.includes('serious') || r.includes('critical'))
    return 'Failure';
  if (r.includes('medium') || r.includes('moderate') || r.includes('low'))
    return 'Warning';
  return 'Success'; // no risk
}

// Numeric rank for sorting the Crime column (not started → high risk).
function crimeRank(s: Subject): number {
  const risk = getCrimeRisk(s);
  if (risk) {
    const r = risk.toLowerCase();
    if (r.includes('high') || r.includes('serious') || r.includes('critical'))
      return 5;
    if (r.includes('medium') || r.includes('moderate')) return 4;
    if (r.includes('low')) return 3;
    return 2; // no risk
  }
  if (s.crimeRequestId && !s.crimeResult) return 1; // pending
  return 0; // not started
}

// Sort key per column — strings compare lexically, numbers numerically.
function subjectSortValue(s: Subject, field: string): string | number {
  switch (field) {
    case 'name':
      return (s.name || '').toLowerCase();
    case 'role':
      return (s.role || '').toLowerCase();
    case 'status':
      return (s.status || 'invited').toLowerCase();
    case 'pan':
      return s.panResult ? 1 : 0;
    case 'aadhaar':
      return s.aadhaarResult ? 1 : 0;
    case 'crime':
      return crimeRank(s);
    case 'dateInitiated':
      return s.createdAt ? new Date(s.createdAt).getTime() : 0;
    default:
      return '';
  }
}

/** Short, locale-friendly date for the "Date initiated" column. */
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // asc → desc → clear, matching the vendor tables' sort behaviour.
  const toggleSort = (field: string) => {
    setPage(1);
    if (sortBy === field) {
      if (sortOrder === 'asc') setSortOrder('desc');
      else setSortBy(null);
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };
  const getSortOrder = (field: string): 'asc' | 'desc' | null =>
    sortBy === field ? sortOrder : null;

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
        setUser(u);
        const list = await listSubjects(token);
        if (cancelled) return;
        setSubjects(list);
        try {
          const draftList = await listServerDrafts();
          if (!cancelled) setDrafts(draftList);
        } catch {
          /* drafts are best-effort — never block the candidate list */
        }
      } catch {
        if (cancelled) return;
        doLogout(router);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleLogout() {
    doLogout(router);
  }

  async function discardDraft(id: string) {
    try {
      await deleteServerDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch {
      /* ignore — user can retry */
    }
  }

  function openAdd() {
    router.push('/home/new');
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter((s) =>
      [s.name, s.email, s.phone, s.role, s.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [subjects, query]);

  // Reset to the first page whenever the search narrows the list.
  useEffect(() => {
    setPage(1);
  }, [query]);

  const sorted = useMemo(() => {
    if (!sortBy) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = subjectSortValue(a, sortBy);
      const bv = subjectSortValue(b, sortBy);
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortOrder === 'desc' ? -cmp : cmp;
    });
    return arr;
  }, [filtered, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  );

  if (!user) return <PageLoader />;

  return (
    <AppShell nav={CLIENT_NAV} user={user} onLogout={handleLogout}>
        <div className="hd">
          {/* Header */}
          <header className="hd-head">
            <div>
              <h1 className="hd-title">
                Your <em>candidates</em>
              </h1>
              <p className="hd-sub">
                Maids, drivers, workers, tenants — everyone you&apos;re
                verifying.
              </p>
            </div>
            <div className="hidden sm:block">
              <Button variant="primary" onClick={openAdd}>
                <Plus size={15} strokeWidth={2.5} />
                Start New Verification
              </Button>
            </div>
          </header>

          {/* Toolbar */}
          {subjects.length > 0 && (
            <div className="hd-toolbar">
              {/* Full-width on phone; fixed width from md up. */}
              <div className="w-full md:w-[320px]">
                <SearchBar
                  value={query}
                  onChange={setQuery}
                  placeholder="Search candidates by name, email or role"
                  containerClassName="w-full"
                />
              </div>
              {/* Count is desktop-only noise on a phone. */}
              <span className="ml-auto hidden text-body-sm text-text-placeholder md:inline">
                {filtered.length} {filtered.length === 1 ? 'candidate' : 'candidates'}
              </span>
            </div>
          )}

          {/* Body */}
          {loading ? (
            <div className="hd-table-wrap">
              <div className="cd-table-empty" style={{ padding: '48px 16px' }}>
                Loading…
              </div>
            </div>
          ) : (
            <>
            {/* ── Desktop / tablet: full table ── */}
            <div className="hidden sm:block">
            <Table bordered className="bg-white">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell
                    label="Candidate"
                    sortable
                    sortOrder={getSortOrder('name')}
                    onSort={() => toggleSort('name')}
                    roundedLeft
                  />
                  <TableHeaderCell
                    label="Role"
                    className="cd-col-hide"
                    sortable
                    sortOrder={getSortOrder('role')}
                    onSort={() => toggleSort('role')}
                  />
                  <TableHeaderCell
                    label="Date initiated"
                    className="cd-col-hide"
                    sortable
                    sortOrder={getSortOrder('dateInitiated')}
                    onSort={() => toggleSort('dateInitiated')}
                  />
                  <TableHeaderCell
                    label="Status"
                    className="cd-col-hide"
                    sortable
                    sortOrder={getSortOrder('status')}
                    onSort={() => toggleSort('status')}
                  />
                  <TableHeaderCell type="empty" roundedRight />
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* In-progress drafts — shown at the top with a Draft status. */}
                {drafts.map((d) => {
                  const draftName =
                    (d.data.name || '').trim() || 'Untitled candidate';
                  const draftRole = (d.data.role || '').trim();
                  const initial = draftName.charAt(0).toUpperCase();
                  return (
                    <TableRow
                      key={`draft-${d.id}`}
                      hoverable
                      className="cd-row cursor-pointer"
                      onClick={() => router.push(`/home/new?draftId=${d.id}`)}
                    >
                      <TableCell
                        value={
                          <div className="cd-cell-bio">
                            <span className="cd-cell-avatar">{initial}</span>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div className="cd-cell-name">{draftName}</div>
                              <div className="cd-cell-sub">
                                Continue where you left off
                              </div>
                            </div>
                          </div>
                        }
                      />
                      <TableCell
                        className="cd-col-hide"
                        value={draftRole || '—'}
                      />
                      <TableCell
                        className="cd-col-hide"
                        value={<span className="cd-cell-sub">—</span>}
                      />
                      <TableCell
                        className="cd-col-hide"
                        value={fmtDate(d.createdAt)}
                      />
                      <TableCell
                        className="cd-col-hide"
                        type="status"
                        statusLabel="Draft"
                        statusVariant="Default"
                      />
                      <TableCell
                        value={
                          <RowMenu
                            isOpen={openMenu === `draft-${d.id}`}
                            onOpen={() =>
                              setOpenMenu((cur) =>
                                cur === `draft-${d.id}` ? null : `draft-${d.id}`,
                              )
                            }
                            onClose={() => setOpenMenu(null)}
                            items={[
                              {
                                label: 'Continue Form',
                                icon: <FileText size={14} />,
                                onClick: () =>
                                  router.push(`/home/new?draftId=${d.id}`),
                              },
                              {
                                label: 'Delete Draft',
                                icon: <Trash2 size={14} />,
                                danger: true,
                                confirm: 'Delete this draft?',
                                onClick: () => void discardDraft(d.id),
                              },
                            ]}
                          />
                        }
                      />
                    </TableRow>
                  );
                })}

                {subjects.length === 0 ? (
                  drafts.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center"
                        value={
                          <div className="flex flex-col items-center gap-3 py-10">
                            <span className="text-body-md text-text-subheading">
                              No background checks yet. Add the first person you
                              want to verify — they&apos;ll get an invite and
                              you&apos;ll see their progress here.
                            </span>
                            <Button variant="primary" onClick={openAdd}>
                              Add your first candidate
                              <ArrowRight size={15} />
                            </Button>
                          </div>
                        }
                      />
                    </TableRow>
                  ) : null
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center"
                      value={
                        <span className="text-text-placeholder">
                          No candidates match <strong>&ldquo;{query}&rdquo;</strong>.
                        </span>
                      }
                    />
                  </TableRow>
                ) : (
                  pageItems.map((s) => (
                    <SubjectRow
                      key={s.id}
                      s={s}
                      isMenuOpen={openMenu === s.id}
                      onOpenMenu={() =>
                        setOpenMenu((cur) => (cur === s.id ? null : s.id))
                      }
                      onCloseMenu={() => setOpenMenu(null)}
                      onOpen={() => router.push(`/subject/${s.id}`)}
                    />
                  ))
                )}
              </TableBody>
            </Table>
            </div>

            {/* ── Mobile: card list (matches the app's compact view) ── */}
            <div className="flex flex-col gap-3 pb-28 sm:hidden">
              {drafts.map((d) => {
                const draftName =
                  (d.data.name || '').trim() || 'Untitled candidate';
                const draftRole = (d.data.role || '').trim();
                const draftPhone = (d.data.phone || '').trim();
                return (
                  <div
                    key={`m-draft-${d.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/home/new?draftId=${d.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/home/new?draftId=${d.id}`);
                      }
                    }}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-border-default bg-white p-4 text-left transition-colors hover:bg-black/[0.02]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-text-heading">
                          {draftName}
                        </span>
                        {draftRole && (
                          <span className="rounded-full bg-neutral-300 px-2 py-0.5 text-body-sm text-text-subheading">
                            {draftRole}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-body-sm text-text-subheading">
                        Mob: {draftPhone || '—'}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-body-sm font-semibold text-warning">
                        Draft
                      </span>
                      <RowMenu
                        isOpen={openMenu === `m-draft-${d.id}`}
                        onOpen={() =>
                          setOpenMenu((cur) =>
                            cur === `m-draft-${d.id}` ? null : `m-draft-${d.id}`,
                          )
                        }
                        onClose={() => setOpenMenu(null)}
                        items={[
                          {
                            label: 'Continue Form',
                            icon: <FileText size={14} />,
                            onClick: () =>
                              router.push(`/home/new?draftId=${d.id}`),
                          },
                          {
                            label: 'Delete Draft',
                            icon: <Trash2 size={14} />,
                            danger: true,
                            confirm: 'Delete this draft?',
                            onClick: () => void discardDraft(d.id),
                          },
                        ]}
                      />
                    </div>
                  </div>
                );
              })}

              {subjects.length === 0 ? (
                drafts.length === 0 ? (
                  <div className="rounded-xl border border-border-default bg-white p-8 text-center text-body-md text-text-subheading">
                    No verifications yet. Tap “Start New Verification” to begin.
                  </div>
                ) : null
              ) : filtered.length === 0 ? (
                <div className="rounded-xl border border-border-default bg-white p-6 text-center text-text-placeholder">
                  No candidates match <strong>“{query}”</strong>.
                </div>
              ) : (
                pageItems.map((s) => {
                  const hasReport = Boolean(
                    s.panResult || s.aadhaarResult || s.crimeResult,
                  );
                  const chip = subjectStatusChip(s);
                  const phone = (s.phone || '').trim();
                  return (
                    <div
                      key={`m-${s.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/subject/${s.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(`/subject/${s.id}`);
                        }
                      }}
                      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-border-default bg-white p-4 text-left transition-colors hover:bg-black/[0.02]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold text-text-heading">
                            {s.name}
                          </span>
                          {s.role && (
                            <span className="rounded-full bg-neutral-300 px-2 py-0.5 text-body-sm text-text-subheading">
                              {s.role}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-body-sm text-text-subheading">
                          Mob: {phone || '—'}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span
                          className={`whitespace-nowrap text-body-sm font-semibold capitalize ${STATUS_TEXT_CLASS[chip.variant]}`}
                        >
                          {chip.label}
                        </span>
                        <RowMenu
                          isOpen={openMenu === `m-${s.id}`}
                          onOpen={() =>
                            setOpenMenu((cur) =>
                              cur === `m-${s.id}` ? null : `m-${s.id}`,
                            )
                          }
                          onClose={() => setOpenMenu(null)}
                          items={[
                            {
                              label: 'View profile',
                              icon: <Eye size={14} />,
                              onClick: () => router.push(`/subject/${s.id}`),
                            },
                            ...(hasReport
                              ? [
                                  {
                                    label: 'Download report',
                                    icon: <Download size={14} />,
                                    onClick: () =>
                                      router.push(`/subject/${s.id}`),
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            </>
          )}

          {/* Mobile sticky action — start a new verification */}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:hidden">
            <Button variant="primary" className="w-full" onClick={openAdd}>
              Start New Verification
            </Button>
          </div>

          {!loading && filtered.length > 0 && totalPages > 1 && (
            <div className="mt-4 flex justify-center">
              <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
                pageSize={pageSize}
              />
            </div>
          )}
        </div>
      </AppShell>
  );
}

function SubjectRow({
  s,
  isMenuOpen,
  onOpenMenu,
  onCloseMenu,
  onOpen,
}: {
  s: Subject;
  isMenuOpen: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const panOk = Boolean(s.panResult);
  const crimeRisk = getCrimeRisk(s);
  const crimePending = Boolean(s.crimeRequestId) && !s.crimeResult;
  const aadhaarOk = Boolean(s.aadhaarResult);
  // A downloadable report exists once any check has produced a result.
  const hasReport = Boolean(s.panResult || s.aadhaarResult || s.crimeResult);
  const initial = (s.name || '?').charAt(0).toUpperCase();
  // Progress across ALL applicable checks + consent outcome — same rule the
  // mobile card uses, so the list and the report always agree (e.g. 5/7).
  const { label: statusLabel, variant: statusVariant } = subjectStatusChip(s);

  return (
    <TableRow
      hoverable
      className={`cd-row cursor-pointer${expanded ? ' is-expanded' : ''}`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.hd-menu') || target.closest('.cd-expand-btn')) return;
        onOpen();
      }}
    >
      <TableCell
        value={
        <div className="cd-cell-bio">
          <span className="cd-cell-avatar">{initial}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="cd-cell-name">{s.name}</div>
            <div className="cd-cell-sub">{s.email || '—'}</div>
            {/* Shown only on mobile — summary + expand toggle */}
            <div className="cd-cell-mobile-row">
              {s.role && <span className="cd-cell-role-pill">{s.role}</span>}
              <span
                className={`cd-status ${STATUS_TEXT_CLASS[statusVariant]}`}
              >
                {statusLabel}
              </span>
              <span className="cd-cell-checks">
                <span className={panOk ? 'cd-chk cd-chk-ok' : 'cd-chk cd-chk-off'} title="PAN">P</span>
                <span className={aadhaarOk ? 'cd-chk cd-chk-ok' : 'cd-chk cd-chk-off'} title="Aadhaar">A</span>
              </span>
              {crimeRisk ? (
                <span className={`badge ${riskClassMini(crimeRisk)}`}>{crimeRisk}</span>
              ) : crimePending ? (
                <span className="cd-status cd-status-pending">pending</span>
              ) : (
                <span className="cd-mob-not-started">not started</span>
              )}
              <button
                type="button"
                className="cd-expand-btn"
                onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }}
                aria-label={expanded ? 'Collapse' : 'Expand'}
              >
                <ChevronDown
                  size={13}
                  style={{
                    transition: 'transform 0.18s ease',
                    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </button>
            </div>
            {/* Expanded detail panel — mobile only */}
            {expanded && (
              <div className="cd-expand-panel">
                <div className="cd-expand-row">
                  <span className="cd-expand-label">Role</span>
                  <span className="cd-expand-val">{s.role || '—'}</span>
                </div>
                <div className="cd-expand-row">
                  <span className="cd-expand-label">PAN</span>
                  <span className="cd-expand-val">
                    {panOk ? <CheckCircle2 size={13} className="cd-check" /> : '—'}
                  </span>
                </div>
                <div className="cd-expand-row">
                  <span className="cd-expand-label">Aadhaar</span>
                  <span className="cd-expand-val">
                    {aadhaarOk ? <CheckCircle2 size={13} className="cd-check" /> : '—'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
        }
      />
      <TableCell className="cd-col-hide" value={s.role || '—'} />
      <TableCell className="cd-col-hide" value={fmtDate(s.createdAt)} />
      <TableCell
        className="cd-col-hide"
        type="status"
        statusLabel={statusLabel}
        statusVariant={statusVariant}
      />
      <TableCell
        value={
          <RowMenu
            isOpen={isMenuOpen}
            onOpen={onOpenMenu}
            onClose={onCloseMenu}
            items={[
              {
                label: 'View profile',
                icon: <Eye size={14} />,
                onClick: onOpen,
              },
              ...(hasReport
                ? [
                    {
                      label: 'Download report',
                      icon: <Download size={14} />,
                      onClick: onOpen,
                    },
                  ]
                : []),
            ]}
          />
        }
      />
    </TableRow>
  );
}

interface RowMenuItem {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  /** When set, clicking asks for confirmation with this prompt first. */
  confirm?: string;
}

/* Portal-rendered row-actions menu (same pattern as /admin/invoices). */
function RowMenu({
  isOpen,
  onOpen,
  onClose,
  items,
}: {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  items: RowMenuItem[];
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);

  // Reset confirmation whenever the menu closes.
  useEffect(() => {
    if (!isOpen) setConfirmIdx(null);
  }, [isOpen]);

  const reposition = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 180;
    const gap = 6;
    let left = rect.right - menuWidth;
    if (left < 12) left = 12;
    const top = rect.bottom + gap;
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (isOpen) reposition();
  }, [isOpen, reposition]);

  useEffect(() => {
    if (!isOpen) return;
    const onScroll = () => onClose();
    const onResize = () => reposition();
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [isOpen, onClose, reposition]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`inv-menu-trigger ${isOpen ? 'is-on' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreHorizontal size={16} />
      </button>
      {isOpen &&
        pos &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            className="inv-menu-pop"
            role="menu"
            style={{ top: pos.top, left: pos.left }}
          >
            {confirmIdx !== null ? (
              /* Inline confirmation — avoids window.confirm() which causes a
                 spurious click on the <tr> when dismissed. */
              <>
                <div className="hd-menu-confirm-label">
                  {items[confirmIdx].confirm}
                </div>
                <button
                  type="button"
                  className="inv-menu-item inv-menu-item-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                    items[confirmIdx].onClick();
                  }}
                  role="menuitem"
                >
                  <Trash2 size={14} />
                  Yes, delete
                </button>
                <button
                  type="button"
                  className="inv-menu-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmIdx(null);
                  }}
                  role="menuitem"
                >
                  Cancel
                </button>
              </>
            ) : (
              items.map((item, i) => (
                <button
                  key={item.label}
                  type="button"
                  className={`inv-menu-item ${
                    item.danger ? 'inv-menu-item-danger' : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.confirm) {
                      setConfirmIdx(i);
                    } else {
                      onClose();
                      item.onClick();
                    }
                  }}
                  role="menuitem"
                >
                  {item.icon}
                  {item.label}
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
