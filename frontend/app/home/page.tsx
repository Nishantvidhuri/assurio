'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Eye,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteSubject,
  listSubjects,
  me,
  type AuthUser,
  type Subject,
} from '../lib/api';
import { getToken } from '../lib/session';
import { doLogout } from '../lib/logout';
import Sidebar, { ICONS, type SidebarItem } from '../components/Sidebar';

const CLIENT_NAV: SidebarItem[] = [
  { href: '/home', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/home/billing', label: 'Billing', icon: ICONS.billing },
  { href: '/home/settings', label: 'Settings', icon: <Settings size={18} strokeWidth={1.7} /> },
];

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

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);

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

  function openAdd() {
    router.push('/home/new');
  }

  async function handleDelete(id: string) {
    try {
      const token = getToken();
      if (!token) return;
      await deleteSubject(token, id);
      setSubjects((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
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

  if (!user) return <div className="loading">Loading...</div>;

  return (
    <div className="shell">
      <Sidebar items={CLIENT_NAV} user={user} onLogout={handleLogout} />
      <main className="shell-main">
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
            <button className="hd-add" onClick={openAdd}>
              <Plus size={15} strokeWidth={2.5} />
              Add candidate
            </button>
          </header>

          {/* Toolbar */}
          {subjects.length > 0 && (
            <div className="hd-toolbar">
              <label
                className={`inv-searchbar ${query ? 'is-filled' : ''}`}
                htmlFor="hd-q"
              >
                <Search size={15} className="inv-searchbar-ico" />
                <input
                  id="hd-q"
                  type="search"
                  placeholder="Search candidates by name, email or role"
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
              <div className="inv-page-count">
                <span className="inv-page-count-n">{filtered.length}</span>
                <span className="inv-page-count-l">
                  {filtered.length === 1 ? 'candidate' : 'candidates'}
                </span>
              </div>
            </div>
          )}

          {/* Body */}
          {loading ? (
            <div className="hd-table-wrap">
              <div className="cd-table-empty" style={{ padding: '48px 16px' }}>
                Loading…
              </div>
            </div>
          ) : subjects.length === 0 ? (
            <div className="hd-empty">
              <div className="hd-empty-ico">
                <Plus size={22} strokeWidth={2} />
              </div>
              <h2 className="hd-empty-title">No background checks yet</h2>
              <p className="hd-empty-sub">
                Add the first person you want to verify. They&apos;ll get an
                invite and you&apos;ll see their progress here.
              </p>
              <button className="hd-empty-cta" onClick={openAdd}>
                Add your first candidate
                <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <div className="hd-table-wrap">
              <div className="cd-table-scroll">
                <table className="cd-table hd-table">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>PAN</th>
                      <th>Aadhaar</th>
                      <th>Crime</th>
                      <th className="actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="cd-table-empty">
                          No candidates match{' '}
                          <strong>&ldquo;{query}&rdquo;</strong>.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((s) => (
                        <SubjectRow
                          key={s.id}
                          s={s}
                          isMenuOpen={openMenu === s.id}
                          onOpenMenu={() =>
                            setOpenMenu((cur) => (cur === s.id ? null : s.id))
                          }
                          onCloseMenu={() => setOpenMenu(null)}
                          onOpen={() => router.push(`/subject/${s.id}`)}
                          onDelete={() => handleDelete(s.id)}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function SubjectRow({
  s,
  isMenuOpen,
  onOpenMenu,
  onCloseMenu,
  onOpen,
  onDelete,
}: {
  s: Subject;
  isMenuOpen: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const panOk = Boolean(s.panResult);
  const aadhaarOk = Boolean(s.aadhaarResult);
  const crimeRisk = getCrimeRisk(s);
  const crimePending = Boolean(s.crimeRequestId) && !s.crimeResult;
  const initial = (s.name || '?').charAt(0).toUpperCase();

  return (
    <tr
      className={`cd-row${expanded ? ' is-expanded' : ''}`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.hd-menu') || target.closest('.cd-expand-btn')) return;
        onOpen();
      }}
    >
      <td>
        <div className="cd-cell-bio">
          <span className="cd-cell-avatar">{initial}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="cd-cell-name">{s.name}</div>
            <div className="cd-cell-sub">{s.email || '—'}</div>
            {/* Shown only on mobile — summary + expand toggle */}
            <div className="cd-cell-mobile-row">
              {s.role && <span className="cd-cell-role-pill">{s.role}</span>}
              <span className={`cd-status cd-status-${s.status || 'invited'}`}>
                {s.status || 'invited'}
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
      </td>
      <td className="cd-col-hide">{s.role || '—'}</td>
      <td className="cd-col-hide">
        <span className={`cd-status cd-status-${s.status || 'invited'}`}>
          {s.status || 'invited'}
        </span>
      </td>
      <td className="cd-col-hide">
        {panOk ? (
          <CheckCircle2 size={14} className="cd-check" />
        ) : (
          <span className="cd-cell-sub">—</span>
        )}
      </td>
      <td className="cd-col-hide">
        {aadhaarOk ? (
          <CheckCircle2 size={14} className="cd-check" />
        ) : (
          <span className="cd-cell-sub">—</span>
        )}
      </td>
      <td className="cd-col-hide">
        {crimeRisk ? (
          <span className={`badge ${riskClassMini(crimeRisk)}`}>
            {crimeRisk}
          </span>
        ) : crimePending ? (
          <span className="cd-status cd-status-pending">pending</span>
        ) : (
          <span className="cd-not-started">not started</span>
        )}
      </td>
      <td className="actions">
        <RowMenu
          isOpen={isMenuOpen}
          onOpen={onOpenMenu}
          onClose={onCloseMenu}
          onOpenSubject={onOpen}
          onDelete={onDelete}
        />
      </td>
    </tr>
  );
}

/* Same portal-rendered menu pattern used on /admin/invoices */
function RowMenu({
  isOpen,
  onOpen,
  onClose,
  onOpenSubject,
  onDelete,
}: {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onOpenSubject: () => void;
  onDelete: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Reset confirming state whenever menu closes
  useEffect(() => {
    if (!isOpen) setConfirming(false);
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
            {confirming ? (
              /* Inline confirmation — avoids window.confirm() which causes
                 a spurious click on the <tr> row when the dialog dismisses,
                 triggering navigation to the (now deleted) subject page. */
              <>
                <div className="hd-menu-confirm-label">Delete this candidate?</div>
                <button
                  type="button"
                  className="inv-menu-item inv-menu-item-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                    onDelete();
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
                    setConfirming(false);
                  }}
                  role="menuitem"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="inv-menu-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                    onOpenSubject();
                  }}
                  role="menuitem"
                >
                  <Eye size={14} />
                  Open
                </button>
                <button
                  type="button"
                  className="inv-menu-item inv-menu-item-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirming(true);
                  }}
                  role="menuitem"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
