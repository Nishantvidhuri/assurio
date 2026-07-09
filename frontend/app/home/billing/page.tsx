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
  MoreHorizontal,
  Receipt,
  Search,
  Settings,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import {
  invoicePrintUrl,
  me,
  myInvoices,
  type AuthUser,
  type InvoiceResponse,
} from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import Sidebar, { ICONS, type SidebarItem } from '../../components/Sidebar';

const CLIENT_NAV: SidebarItem[] = [
  { href: '/home', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/home/billing', label: 'Billing', icon: ICONS.billing },
  { href: '/home/settings', label: 'Settings', icon: <Settings size={18} strokeWidth={1.7} /> },
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

export default function BillingPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [invoices, setInvoices] = useState<InvoiceResponse[]>([]);
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
        if (u.role === 'admin') {
          router.replace('/admin');
          return;
        }
        if (u.role === 'candidate') {
          router.replace('/candidate');
          return;
        }
        setUser(u);
        const list = await myInvoices(token);
        if (cancelled) return;
        setInvoices(list);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter((inv) =>
      [
        inv.invoiceNumber,
        inv.customer?.name,
        inv.customer?.email,
        inv.razorpayPaymentId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [invoices, query]);

  // Stats derived from invoices that are actually paid
  const stats = useMemo(() => {
    const paid = invoices.filter((i) => i.status === 'paid');
    const totalPaid = paid.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const lastPaidAt = paid[0]?.paidAt; // list is already sorted desc by paidAt
    return {
      totalPaid,
      count: paid.length,
      lastPaidAt,
      avg: paid.length ? Math.round(totalPaid / paid.length) : 0,
    };
  }, [invoices]);

  if (!user) return <div className="loading">Loading...</div>;

  return (
    <div className="shell">
      <Sidebar items={CLIENT_NAV} user={user} onLogout={handleLogout} />
      <main className="shell-main">
        <div className="bl">
          {/* Header */}
          <header className="bl-head">
            <div>
              <div className="bl-eyebrow">
                <Receipt size={12} />
                Billing
              </div>
              <h1 className="bl-title">
                Your <em>payments</em>
              </h1>
              <p className="bl-sub">
                Every verification you&apos;ve paid for. Receipts available for
                download anytime.
              </p>
            </div>
          </header>

          {/* Stats */}
          <section className="bl-stats">
            <div className="bl-stat bl-stat-hero">
              <div className="bl-stat-ico">
                <Wallet size={15} />
              </div>
              <div>
                <div className="bl-stat-label">Total paid</div>
                <div className="bl-stat-value">{fmtINR(stats.totalPaid)}</div>
              </div>
            </div>
            <div className="bl-stat">
              <div className="bl-stat-ico">
                <Receipt size={15} />
              </div>
              <div>
                <div className="bl-stat-label">Receipts</div>
                <div className="bl-stat-value">{stats.count}</div>
              </div>
            </div>
            <div className="bl-stat">
              <div className="bl-stat-ico">
                <CheckCircle2 size={15} />
              </div>
              <div>
                <div className="bl-stat-label">Avg per check</div>
                <div className="bl-stat-value">
                  {stats.avg ? fmtINR(stats.avg) : '—'}
                </div>
              </div>
            </div>
          </section>

          {/* Toolbar */}
          {invoices.length > 0 && (
            <div className="bl-toolbar">
              <label
                className={`inv-searchbar ${query ? 'is-filled' : ''}`}
                htmlFor="bl-q"
              >
                <Search size={15} className="inv-searchbar-ico" />
                <input
                  id="bl-q"
                  type="search"
                  placeholder="Search invoice number, candidate or payment ref"
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
                  {filtered.length === 1 ? 'receipt' : 'receipts'}
                </span>
              </div>
            </div>
          )}

          {error && <div className="error">{error}</div>}

          {/* Table or empty */}
          {loading ? (
            <div className="inv-table-wrap">
              <div className="cd-table-empty" style={{ padding: '48px 16px' }}>
                Loading…
              </div>
            </div>
          ) : invoices.length === 0 ? (
            <div className="bl-empty">
              <div className="bl-empty-ico">
                <Receipt size={22} />
              </div>
              <h2 className="bl-empty-title">No receipts yet</h2>
              <p className="bl-empty-sub">
                Once you pay for a candidate verification, the receipt will
                show up here for download.
              </p>
            </div>
          ) : (
            <div className="inv-table-wrap">
              <div className="cd-table-scroll">
                <table className="cd-table">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th className="cd-col-hide">Receipt</th>
                      <th className="cd-col-hide">Date</th>
                      <th className="cd-col-hide">Status</th>
                      <th className={`num cd-col-hide`}>Amount</th>
                      <th className="actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="cd-table-empty">
                          No receipts match{' '}
                          <strong>&ldquo;{query}&rdquo;</strong>.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((inv) => (
                        <InvoiceRow
                          key={inv.id}
                          inv={inv}
                          isMenuOpen={openMenu === inv.id}
                          onOpenMenu={() =>
                            setOpenMenu((cur) =>
                              cur === inv.id ? null : inv.id,
                            )
                          }
                          onCloseMenu={() => setOpenMenu(null)}
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

function InvoiceRow({
  inv,
  isMenuOpen,
  onOpenMenu,
  onCloseMenu,
}: {
  inv: InvoiceResponse;
  isMenuOpen: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const dt = fmtDate(inv.paidAt);
  const initial = (inv.customer?.name || '?').charAt(0).toUpperCase();
  const preview = invoicePrintUrl(inv.id);
  const download = preview + '?download=1';

  return (
    <tr className="cd-row">
      <td>
        <div className="cd-cell-bio">
          <span className="cd-cell-avatar">{initial}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="cd-cell-name">{inv.customer?.name || '—'}</div>
            <div className="cd-cell-sub">{inv.customer?.email || '—'}</div>
            <div className="cd-cell-mobile-row">
              <span className="inv-number" style={{ fontSize: 11 }}>{inv.invoiceNumber}</span>
              <span className={`inv-status inv-status-${inv.status}`}>
                {inv.status === 'paid' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                {inv.status}
              </span>
              <span className="inv-amount" style={{ fontSize: 12 }}>{fmtINR(inv.total)}</span>
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
                  <span className="cd-expand-label">Receipt</span>
                  <span className="cd-expand-val">{inv.invoiceNumber}</span>
                </div>
                <div className="cd-expand-row">
                  <span className="cd-expand-label">Date</span>
                  <span className="cd-expand-val">{dt.date} {dt.time}</span>
                </div>
                <div className="cd-expand-row">
                  <span className="cd-expand-label">Status</span>
                  <span className="cd-expand-val">
                    <span className={`inv-status inv-status-${inv.status}`}>
                      {inv.status === 'paid' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                      {inv.status}
                    </span>
                  </span>
                </div>
                <div className="cd-expand-row">
                  <span className="cd-expand-label">Amount</span>
                  <span className="cd-expand-val">{fmtINR(inv.total)}</span>
                </div>
                <div className="cd-expand-row">
                  <span className="cd-expand-label">Receipt</span>
                  <span className="cd-expand-val">
                    <a href={download} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', fontSize: 12 }}>
                      Download PDF
                    </a>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="cd-col-hide">
        <span className="inv-number">{inv.invoiceNumber}</span>
      </td>
      <td className="cd-col-hide">
        <div className="inv-cell-date">
          <div>{dt.date}</div>
          <div className="cd-cell-sub">{dt.time}</div>
        </div>
      </td>
      <td className="cd-col-hide">
        <span className={`inv-status inv-status-${inv.status}`}>
          {inv.status === 'paid' ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
          {inv.status}
        </span>
      </td>
      <td className="num cd-col-hide">
        <span className="inv-amount">{fmtINR(inv.total)}</span>
      </td>
      <td className="actions">
        <RowMenu
          isOpen={isMenuOpen}
          onOpen={onOpenMenu}
          onClose={onCloseMenu}
          preview={preview}
          download={download}
        />
      </td>
    </tr>
  );
}

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
