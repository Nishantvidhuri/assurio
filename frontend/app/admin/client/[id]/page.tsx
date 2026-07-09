'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  FileText,
  Search,
  ShieldAlert,
  Users,
  Wallet,
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
import Sidebar, { ICONS, type SidebarItem } from '../../../components/Sidebar';

const ADMIN_NAV: SidebarItem[] = [
  { href: '/admin', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/admin/clients', label: 'Clients', icon: ICONS.clients },
  { href: '/admin/invoices', label: 'Invoices', icon: ICONS.invoices },
  { href: '/admin/whatsapp', label: 'WhatsApp', icon: ICONS.whatsapp },
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
    if (!q) return detail.subjects;
    return detail.subjects.filter((s) =>
      [s.name, s.email, s.role, s.status].join(' ').toLowerCase().includes(q),
    );
  }, [detail, query]);

  if (!user) return <div className="loading">Loading...</div>;

  return (
    <div className="shell">
      <Sidebar items={ADMIN_NAV} user={user} onLogout={handleLogout} />
      <main className="shell-main">
        <Link className="cd-back" href="/admin/clients">
          <ArrowLeft size={14} />
          All clients
        </Link>

        {error && <div className="error">{error}</div>}

        {detail && (
          <>
            {/* Client header */}
            <header className="cd-head">
              <div className="cd-head-avatar">
                {(detail.client.name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="cd-head-meta">
                <h1 className="cd-head-name">{detail.client.name}</h1>
                <div className="cd-head-sub">
                  <span>{detail.client.email}</span>
                  <span className="cd-dot" aria-hidden="true">·</span>
                  <span>
                    {detail.client.candidateCount}{' '}
                    candidate
                    {detail.client.candidateCount === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            </header>

            {/* Stat cards (replaces the old wallet table) */}
            <section className="cd-stats">
              <div className="cd-stat cd-stat-hero">
                <div className="cd-stat-ico">
                  <Wallet size={16} />
                </div>
                <div>
                  <div className="cd-stat-label">Total spent</div>
                  <div className="cd-stat-value">
                    ₹{detail.billing.totalAmount}
                  </div>
                </div>
              </div>
              <div className="cd-stat">
                <div className="cd-stat-ico">
                  <CreditCard size={16} />
                </div>
                <div>
                  <div className="cd-stat-label">PAN checks</div>
                  <div className="cd-stat-value">
                    {detail.billing.byType.pan}
                  </div>
                </div>
              </div>
              <div className="cd-stat">
                <div className="cd-stat-ico">
                  <FileText size={16} />
                </div>
                <div>
                  <div className="cd-stat-label">Aadhaar checks</div>
                  <div className="cd-stat-value">
                    {detail.billing.byType.aadhaar}
                  </div>
                </div>
              </div>
              <div className="cd-stat">
                <div className="cd-stat-ico">
                  <ShieldAlert size={16} />
                </div>
                <div>
                  <div className="cd-stat-label">Crime checks</div>
                  <div className="cd-stat-value">
                    {detail.billing.byType.crime}
                  </div>
                </div>
              </div>
            </section>

            {/* Candidates section */}
            <section className="cd-section">
              <div className="cd-section-head">
                <div>
                  <div className="cd-section-eyebrow">
                    <Users size={12} />
                    Candidates
                  </div>
                  <h2 className="cd-section-title">
                    Every <em>person</em> they&apos;ve checked
                  </h2>
                </div>
                <label
                  className={`inv-searchbar ${query ? 'is-filled' : ''}`}
                  htmlFor="cd-q"
                >
                  <Search size={15} className="inv-searchbar-ico" />
                  <input
                    id="cd-q"
                    type="search"
                    placeholder="Search by name, email or role"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {query && (
                    <button
                      type="button"
                      className="inv-searchbar-clear"
                      onClick={() => setQuery('')}
                      aria-label="Clear search"
                    >
                      <X size={13} strokeWidth={2.5} />
                    </button>
                  )}
                </label>
              </div>

              <div className="cd-table-wrap">
                <div className="cd-table-scroll">
                  <table className="cd-table">
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th className="cd-col-hide">Role</th>
                        <th className="cd-col-hide">Status</th>
                        <th className="cd-col-hide">PAN</th>
                        <th className="cd-col-hide">Aadhaar</th>
                        <th className="cd-col-hide">Crime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.subjects.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="cd-table-empty">
                            This client hasn&apos;t added any candidates yet.
                          </td>
                        </tr>
                      ) : filteredSubjects.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="cd-table-empty">
                            No candidates match{' '}
                            <strong>&ldquo;{query}&rdquo;</strong>.
                          </td>
                        </tr>
                      ) : (
                        filteredSubjects.map((s) => (
                          <CandidateRow
                            key={s.id}
                            s={s}
                            onOpen={() => router.push(`/admin/subject/${s.id}`)}
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function CandidateRow({ s, onOpen }: { s: AdminSubjectRow; onOpen: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const initial = (s.name || '?').charAt(0).toUpperCase();

  return (
    <tr
      className="cd-row"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.cd-expand-btn')) return;
        onOpen();
      }}
    >
      <td>
        <div className="cd-cell-bio">
          <span className="cd-cell-avatar">{initial}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="cd-cell-name">{s.name}</div>
            <div className="cd-cell-sub">{s.email}</div>
            <div className="cd-cell-mobile-row">
              {s.role && <span className="cd-cell-role-pill">{s.role}</span>}
              <span className={`cd-status cd-status-${s.status}`}>{s.status}</span>
              <span className="cd-cell-checks">
                <span className={s.hasPan ? 'cd-chk cd-chk-ok' : 'cd-chk cd-chk-off'} title="PAN">P</span>
                <span className={s.hasAadhaar ? 'cd-chk cd-chk-ok' : 'cd-chk cd-chk-off'} title="Aadhaar">A</span>
              </span>
              {s.crimeRisk ? (
                <span className={`badge ${riskClassBadge(s.crimeRisk)}`}>{s.crimeRisk}</span>
              ) : (
                <span className="cd-mob-not-started">not started</span>
              )}
              <button
                type="button"
                className="cd-expand-btn"
                onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }}
                aria-label={expanded ? 'Collapse' : 'Expand'}
              >
                <ChevronDown size={13} style={{ transition: 'transform 0.18s ease', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
              </button>
            </div>
            {expanded && (
              <div className="cd-expand-panel">
                <div className="cd-expand-row">
                  <span className="cd-expand-label">Role</span>
                  <span className="cd-expand-val">{s.role || '—'}</span>
                </div>
                <div className="cd-expand-row">
                  <span className="cd-expand-label">PAN</span>
                  <span className="cd-expand-val">
                    {s.hasPan ? <CheckCircle2 size={13} className="cd-check" /> : '—'}
                  </span>
                </div>
                <div className="cd-expand-row">
                  <span className="cd-expand-label">Aadhaar</span>
                  <span className="cd-expand-val">
                    {s.hasAadhaar ? <CheckCircle2 size={13} className="cd-check" /> : '—'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="cd-col-hide">{s.role || '—'}</td>
      <td className="cd-col-hide">
        <span className={`cd-status cd-status-${s.status}`}>{s.status}</span>
      </td>
      <td className="cd-col-hide">
        {s.hasPan ? <CheckCircle2 size={14} className="cd-check" /> : <span className="cd-cell-sub">—</span>}
      </td>
      <td className="cd-col-hide">
        {s.hasAadhaar ? <CheckCircle2 size={14} className="cd-check" /> : <span className="cd-cell-sub">—</span>}
      </td>
      <td className="cd-col-hide">
        {s.crimeRisk
          ? <span className={`badge ${riskClassBadge(s.crimeRisk)}`}>{s.crimeRisk}</span>
          : <span className="cd-not-started">not started</span>}
      </td>
    </tr>
  );
}
