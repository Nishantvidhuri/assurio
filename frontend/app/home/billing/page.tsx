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
  Download,
  Eye,
  MoreHorizontal,
  Receipt,
  Search,
  Wallet,
  X,
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
import { CLIENT_NAV } from '../../components/Sidebar';
import AppShell from '../../components/AppShell';
import StatCard from '../../components/StatCard';
import {
  Callout,
  Input,
  Loader,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Tag,
} from '@/shared/components/ui';


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

function statusVariant(status: string): 'Success' | 'Warning' | 'Failure' | 'Default' {
  const s = (status || '').toLowerCase();
  if (['paid', 'done', 'active', 'completed'].includes(s)) return 'Success';
  if (['pending', 'in-progress', 'in_progress', 'issued'].includes(s)) return 'Warning';
  if (['failed', 'flagged', 'cancelled', 'expired'].includes(s)) return 'Failure';
  return 'Default';
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

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader description="Loading..." />
      </div>
    );
  }

  return (
    <AppShell nav={CLIENT_NAV} user={user} onLogout={handleLogout}>
        <div className="flex flex-col gap-5">
          {/* Header */}
          <header>
            <h1 className="text-xl font-semibold text-text-heading">Your payments</h1>
            <p className="mt-1 text-body-md text-text-subheading">
              Every verification you&apos;ve paid for. Receipts available for
              download anytime.
            </p>
          </header>

          {/* Stats */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Total paid" value={fmtINR(stats.totalPaid)} />
            <StatCard label="Receipts" value={String(stats.count)} />
            <StatCard label="Avg per check" value={stats.avg ? fmtINR(stats.avg) : '—'} />
          </section>

          {/* Toolbar */}
          {invoices.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="max-w-md flex-1">
                <Input
                  id="bl-q"
                  type="search"
                  placeholder="Search invoice number, candidate or payment ref"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  leftIcon={<Search size={15} />}
                  rightIcon={
                    query ? (
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        aria-label="Clear search"
                        className="inline-flex items-center justify-center text-icon-muted hover:text-text-body"
                      >
                        <X size={13} strokeWidth={2.5} />
                      </button>
                    ) : undefined
                  }
                />
              </div>
              <div className="shrink-0 text-body-sm font-medium text-text-subheading">
                <span className="font-bold text-text-body">{filtered.length}</span>{' '}
                {filtered.length === 1 ? 'receipt' : 'receipts'}
              </div>
            </div>
          )}

          {error && (
            <Callout
              state="Error"
              title={error}
              showAction={false}
              showCloseIcon={false}
              multiline
            />
          )}

          {/* Table or empty */}
          {loading ? (
            <div className="rounded-md border border-border-default bg-white py-12">
              <Loader description="Loading..." />
            </div>
          ) : (
            <Table bordered>
              <TableHeader>
                <TableRow hoverable={false}>
                  <TableHeaderCell label="Candidate" roundedLeft />
                  <TableHeaderCell label="Receipt" />
                  <TableHeaderCell label="Date" />
                  <TableHeaderCell label="Status" />
                  <TableHeaderCell type="number" label="Amount" className="text-right" />
                  <TableHeaderCell type="empty" roundedRight />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow hoverable={false}>
                    <TableCell
                      colSpan={6}
                      value={
                        <span className="block py-8 text-center text-body-md text-text-subheading">
                          No receipts yet. Once you pay for a candidate
                          verification, the receipt will show up here for
                          download.
                        </span>
                      }
                    />
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow hoverable={false}>
                    <TableCell
                      colSpan={6}
                      value={
                        <span className="block py-6 text-center text-body-md text-text-subheading">
                          No receipts match{' '}
                          <strong className="text-text-body">&ldquo;{query}&rdquo;</strong>.
                        </span>
                      }
                    />
                  </TableRow>
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
              </TableBody>
            </Table>
          )}
        </div>
      </AppShell>
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
  const dt = fmtDate(inv.paidAt);
  const preview = invoicePrintUrl(inv.id);
  const download = preview + '?download=1';

  return (
    <TableRow hoverable>
      <TableCell
        type="default"
        value={
          <div className="min-w-0">
            <div className="truncate text-body-md font-medium text-text-body">
              {inv.customer?.name || '—'}
            </div>
            <div className="truncate text-body-sm text-text-subheading">
              {inv.customer?.email || '—'}
            </div>
          </div>
        }
      />
      <TableCell
        type="default"
        value={
          <span className="whitespace-nowrap font-mono text-body-sm text-text-body">
            {inv.invoiceNumber}
          </span>
        }
      />
      <TableCell
        type="default"
        value={
          <div className="whitespace-nowrap">
            <div className="text-body-md text-text-body">{dt.date}</div>
            <div className="text-body-sm text-text-subheading">{dt.time}</div>
          </div>
        }
      />
      <TableCell
        type="default"
        value={<Tag variant={statusVariant(inv.status)} label={inv.status} />}
      />
      <TableCell
        type="number"
        value={
          <span className="font-medium text-text-body">{fmtINR(inv.total)}</span>
        }
      />
      <TableCell
        type="default"
        className="w-[56px]"
        value={
          <RowMenu
            isOpen={isMenuOpen}
            onOpen={onOpenMenu}
            onClose={onCloseMenu}
            preview={preview}
            download={download}
          />
        }
      />
    </TableRow>
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
        className={`inline-flex size-7 items-center justify-center rounded-md text-icon-default transition-colors hover:bg-neutral-200 hover:text-text-body ${
          isOpen ? 'bg-neutral-200 text-text-body' : ''
        }`}
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
            className="fixed z-50 w-[180px] rounded-md border border-neutral-500 bg-white py-1 shadow-[0px_3px_10px_0px_rgba(11,26,59,0.1)]"
            role="menu"
            style={{ top: pos.top, left: pos.left }}
          >
            <a
              href={preview}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-body-md font-medium text-text-body transition-colors hover:bg-neutral-200"
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
              className="flex items-center gap-2 px-3 py-2 text-body-md font-medium text-text-body transition-colors hover:bg-neutral-200"
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
