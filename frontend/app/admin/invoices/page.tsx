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
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  FileText,
  MoreHorizontal,
  Receipt,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import {
  adminInvoices,
  invoicePrintUrl,
  me,
  type AdminInvoiceRow,
  type AuthUser,
} from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import Sidebar, { ICONS, type SidebarItem } from '../../components/Sidebar';

const ADMIN_NAV: SidebarItem[] = [
  { href: '/admin', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/admin/clients', label: 'Clients', icon: ICONS.clients },
  { href: '/admin/invoices', label: 'Invoices', icon: ICONS.invoices },
  { href: '/admin/operations', label: 'Operations', icon: ICONS.operations },
];

function fmtINR(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function fmtDate(d?: string): { date: string; time: string } {
  if (!d) return { date: '—', time: '' };
  const dt = new Date(d);
  return {
    date: dt.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    time: dt.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
  };
}

function checkChips(checks: AdminInvoiceRow['checks']) {
  const ok: string[] = [];
  if (checks.pan) ok.push('PAN');
  if (checks.aadhaar) ok.push('Aadhaar');
  if (checks.crime) ok.push('Crime');
  return ok;
}

export default function InvoicesPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [rows, setRows] = useState<AdminInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
        if (u.role !== 'admin') {
          router.replace('/home');
          return;
        }
        setUser(u);
        const list = await adminInvoices(token);
        if (cancelled) return;
        setRows(list);
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

  // ⌘K / Ctrl+K focuses the search bar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const el = document.getElementById('inv-q') as HTMLInputElement | null;
        el?.focus();
        el?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [
        r.invoiceNumber,
        r.candidateName,
        r.candidateEmail,
        r.clientName,
        r.clientEmail,
        r.razorpayPaymentId,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  const total = useMemo(
    () => filtered.reduce((s, r) => s + r.total, 0),
    [filtered],
  );

  if (!user) return <div className="loading">Loading…</div>;

  return (
    <div className="shell">
      <Sidebar items={ADMIN_NAV} user={user} onLogout={handleLogout} />
      <main className="shell-main">
        <div className="inv-page">
          {/* Header */}
          <div className="inv-page-head">
            <div className="inv-page-headline">
              <div className="inv-page-eyebrow">
                <FileText size={12} />
                Invoices
              </div>
              <h1 className="inv-page-title">
                Payments &amp; <em>receipts</em>
              </h1>
              <p className="inv-page-sub">
                Every payment captured through Razorpay, and the checks each
                one paid for.
              </p>
            </div>
            <div className="inv-page-stats">
              <div className="inv-page-stat">
                <div className="inv-page-stat-ico">
                  <Receipt size={15} />
                </div>
                <div>
                  <div className="inv-page-stat-label">Total invoices</div>
                  <div className="inv-page-stat-value">{filtered.length}</div>
                </div>
              </div>
              <div className="inv-page-stat">
                <div className="inv-page-stat-ico">
                  <CheckCircle2 size={15} />
                </div>
                <div>
                  <div className="inv-page-stat-label">Collected</div>
                  <div className="inv-page-stat-value">{fmtINR(total)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="inv-page-toolbar">
            <label
              className={`inv-searchbar ${query ? 'is-filled' : ''}`}
              htmlFor="inv-q"
            >
              <Search size={15} className="inv-searchbar-ico" />
              <input
                id="inv-q"
                type="search"
                placeholder="Search invoice number, candidate, client or payment ref"
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
              <kbd className="inv-searchbar-kbd" aria-hidden="true">⌘K</kbd>
            </label>
            <div className="inv-page-count">
              <span className="inv-page-count-n">{filtered.length}</span>
              <span className="inv-page-count-l">
                {filtered.length === 1 ? 'result' : 'results'}
              </span>
            </div>
          </div>

          {error && <div className="error">{error}</div>}

          {/* Table */}
          <div className="inv-table-wrap">
            <div className="inv-table-scroll">
              <table className="inv-list">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th className="cd-col-hide">Invoice</th>
                    <th className="cd-col-hide">Client</th>
                    <th className="cd-col-hide">Date</th>
                    <th className="cd-col-hide">Checks</th>
                    <th className="cd-col-hide">Status</th>
                    <th className="num cd-col-hide">Amount</th>
                    <th className="actions" aria-label="Row actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="inv-list-empty">
                        Loading…
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="inv-list-empty">
                        <div className="inv-empty-card">
                          <div className="inv-empty-ico">
                            <Receipt size={22} />
                          </div>
                          <div className="inv-empty-title">
                            {query ? 'No invoices match' : 'No invoices yet'}
                          </div>
                          <div className="inv-empty-sub">
                            {query
                              ? 'Try a different search term.'
                              : 'They show up here the moment a payment is captured.'}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r) => (
                      <InvoiceRow
                        key={r.id}
                        row={r}
                        isOpen={openMenu === r.id}
                        onOpen={() =>
                          setOpenMenu((cur) => (cur === r.id ? null : r.id))
                        }
                        onClose={() => setOpenMenu(null)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function InvoiceRow({
  row,
  isOpen,
  onOpen,
  onClose,
}: {
  row: AdminInvoiceRow;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const chips = checkChips(row.checks);
  const dt = fmtDate(row.paidAt);
  // Prefer the S3 presigned URL when available; fall back to the backend print renderer.
  const printUrl = invoicePrintUrl(row.id);
  const preview = row.pdfUrl ?? printUrl;
  const download = row.pdfUrl ?? (printUrl + '?download=1');
  const firstLetter = (row.candidateName || '?').charAt(0).toUpperCase();

  return (
    <tr className="cd-row">
      <td>
        <div className="inv-cell-bio">
          <span className="inv-cell-avatar">{firstLetter}</span>
          <div className="inv-cell-meta" style={{ minWidth: 0, flex: 1 }}>
            <div className="inv-cell-name">{row.candidateName}</div>
            <div className="inv-cell-sub">{row.candidateEmail || '—'}</div>
            <div className="cd-cell-mobile-row">
              <span className="inv-number" style={{ fontSize: 11 }}>{row.invoiceNumber}</span>
              <span className={`inv-status inv-status-${row.status}`}>
                {row.status === 'paid' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                {row.status}
              </span>
              <span className="inv-amount" style={{ fontSize: 12 }}>{fmtINR(row.total)}</span>
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
                  <span className="cd-expand-label">Invoice</span>
                  <span className="cd-expand-val">{row.invoiceNumber}</span>
                </div>
                <div className="cd-expand-row">
                  <span className="cd-expand-label">Client</span>
                  <span className="cd-expand-val">{row.clientName}</span>
                </div>
                <div className="cd-expand-row">
                  <span className="cd-expand-label">Date</span>
                  <span className="cd-expand-val">{dt.date} {dt.time}</span>
                </div>
                {chips.length > 0 && (
                  <div className="cd-expand-row">
                    <span className="cd-expand-label">Checks</span>
                    <span className="cd-expand-val">
                      <span className="inv-checks">
                        {chips.map((c) => (
                          <span key={c} className="inv-check-chip"><CheckCircle2 size={11} />{c}</span>
                        ))}
                      </span>
                    </span>
                  </div>
                )}
                <div className="cd-expand-row">
                  <span className="cd-expand-label">Status</span>
                  <span className="cd-expand-val">
                    <span className={`inv-status inv-status-${row.status}`}>
                      {row.status === 'paid' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                      {row.status}
                    </span>
                  </span>
                </div>
                <div className="cd-expand-row">
                  <span className="cd-expand-label">Amount</span>
                  <span className="cd-expand-val">{fmtINR(row.total)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="cd-col-hide">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="inv-number">{row.invoiceNumber}</span>
          {row.pdfUrl && (
            <span className="inv-pdf-badge" title="PDF stored in cloud">
              PDF
            </span>
          )}
        </div>
      </td>
      <td className="cd-col-hide">
        <div className="inv-cell-meta">
          <div className="inv-cell-name">{row.clientName}</div>
          <div className="inv-cell-sub">{row.clientEmail || '—'}</div>
        </div>
      </td>
      <td className="cd-col-hide">
        <div className="inv-cell-date">
          <div>{dt.date}</div>
          <div className="inv-cell-sub">{dt.time}</div>
        </div>
      </td>
      <td className="cd-col-hide">
        {chips.length === 0 ? (
          <span className="inv-cell-sub">—</span>
        ) : (
          <span className="inv-checks">
            {chips.map((c) => (
              <span key={c} className="inv-check-chip"><CheckCircle2 size={11} />{c}</span>
            ))}
          </span>
        )}
      </td>
      <td className="cd-col-hide">
        <span className={`inv-status inv-status-${row.status}`}>
          {row.status === 'paid' ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
          {row.status}
        </span>
      </td>
      <td className="num cd-col-hide">
        <span className="inv-amount">{fmtINR(row.total)}</span>
      </td>
      <td className="actions">
        <RowMenu isOpen={isOpen} onOpen={onOpen} onClose={onClose} preview={preview} download={download} />
      </td>
    </tr>
  );
}

/* ---------- portal-rendered three-dot menu (escapes table overflow) ---------- */

function RowMenu({
  isOpen,
  onOpen,
  onClose,
  preview,
  download,
}: {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  preview: string;
  download: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const reposition = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 180;
    const gap = 6;
    // Anchor to the right edge of the trigger, drop below it.
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
        onClick={onOpen}
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
            <a
              href={preview}
              target="_blank"
              rel="noopener noreferrer"
              className="inv-menu-item"
              onClick={onClose}
              role="menuitem"
            >
              <Eye size={14} />
              Preview
            </a>
            <a
              href={download}
              target="_blank"
              rel="noopener noreferrer"
              className="inv-menu-item"
              onClick={onClose}
              role="menuitem"
            >
              <Download size={14} />
              Download
            </a>
          </div>,
          document.body,
        )}
    </>
  );
}
