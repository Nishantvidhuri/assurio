'use client';
import PageLoader from '@/app/components/PageLoader';

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
  invoiceDetail,
  invoicePrintUrl,
  me,
  type AdminInvoiceRow,
  type AuthUser,
  type InvoiceDetailResponse,
} from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import { ICONS, type SidebarItem } from '../../components/Sidebar';
import AppShell from '../../components/AppShell';
import StatCard from '../../components/StatCard';
import {
  Button,
  Divider,
  Pagination,
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
  const [sortKey, setSortKey] = useState<'invoice' | 'name' | 'amount' | 'date' | null>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailsRow, setDetailsRow] = useState<AdminInvoiceRow | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  function toggleSort(key: 'invoice' | 'name' | 'amount' | 'date') {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

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
  const apiSpend = useMemo(
    () => filtered.reduce((s, r) => s + (r.apiCost ?? 0), 0),
    [filtered],
  );
  const profit = total - apiSpend;

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'invoice':
          return dir * a.invoiceNumber.localeCompare(b.invoiceNumber);
        case 'name':
          return dir * (a.candidateName || '').localeCompare(b.candidateName || '');
        case 'amount':
          return dir * (a.total - b.total);
        case 'date':
          return (
            dir *
            (new Date(a.paidAt ?? 0).getTime() - new Date(b.paidAt ?? 0).getTime())
          );
        default:
          return 0;
      }
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sorted, currentPage, pageSize],
  );

  const allPagedSelected = paged.length > 0 && paged.every((r) => selected.has(r.id));
  const somePagedSelected = paged.some((r) => selected.has(r.id));

  function toggleSelectAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of paged) {
        if (checked) next.add(r.id);
        else next.delete(r.id);
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

  if (!user) return <PageLoader />;

  return (
    <AppShell nav={ADMIN_NAV} user={user} onLogout={handleLogout}>
        <div className="inv-page">
          {/* Header — Verification Queue layout: title/sub, then a full-width
           * row of summary cards beneath. */}
          <div className="mb-5">
            <h1 className="text-xl font-semibold text-text-heading">
              Payments &amp; receipts
            </h1>
            <p className="mt-1 text-body-md text-text-subheading">
              Every payment captured through Razorpay, and the checks each one
              paid for.
            </p>
          </div>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Collected" value={fmtINR(total)} />
            <StatCard label="API spend" value={fmtINR(apiSpend)} />
            <StatCard
              label="Profit"
              value={
                <span className={profit >= 0 ? 'text-success' : 'text-failure'}>
                  {fmtINR(profit)}
                </span>
              }
            />
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
          </div>

          {error && <div className="error">{error}</div>}

          {/* Table */}
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
                  label="Invoice ID"
                  sortable
                  sortOrder={sortKey === 'invoice' ? sortDir : null}
                  onSort={() => toggleSort('invoice')}
                />
                <TableHeaderCell
                  label="Name"
                  sortable
                  sortOrder={sortKey === 'name' ? sortDir : null}
                  onSort={() => toggleSort('name')}
                />
                <TableHeaderCell label="Email" className="cd-col-hide" />
                <TableHeaderCell
                  label="Amount"
                  type="number"
                  sortable
                  sortOrder={sortKey === 'amount' ? sortDir : null}
                  onSort={() => toggleSort('amount')}
                />
                <TableHeaderCell
                  label="Date"
                  className="cd-col-hide"
                  sortable
                  sortOrder={sortKey === 'date' ? sortDir : null}
                  onSort={() => toggleSort('date')}
                />
                <TableHeaderCell label="Status" />
                <TableHeaderCell type="empty" />
              </TableRow>
            </TableHeader>
            <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center" value={<span className="text-text-placeholder">Loading…</span>} />
                    </TableRow>
                  ) : paged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center" value={
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
                      } />
                    </TableRow>
                  ) : (
                    paged.map((r) => (
                      <InvoiceRow
                        key={r.id}
                        row={r}
                        checked={selected.has(r.id)}
                        onCheckedChange={(checked) => toggleSelect(r.id, checked)}
                        isOpen={openMenu === r.id}
                        onOpen={() =>
                          setOpenMenu((cur) => (cur === r.id ? null : r.id))
                        }
                        onClose={() => setOpenMenu(null)}
                        onDetails={() => setDetailsRow(r)}
                      />
                    ))
                  )}
            </TableBody>
          </Table>
          <InvoiceDetailsDialog row={detailsRow} onClose={() => setDetailsRow(null)} />
          <div className="mt-3">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        </div>
      </AppShell>
  );
}

function InvoiceRow({
  row,
  checked,
  onCheckedChange,
  isOpen,
  onOpen,
  onClose,
  onDetails,
}: {
  row: AdminInvoiceRow;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDetails: () => void;
}) {
  const dt = fmtDate(row.paidAt);
  // Prefer the S3 presigned URL when available; fall back to the backend print renderer.
  const printUrl = invoicePrintUrl(row.id);
  const download = row.pdfUrl ?? (printUrl + '?download=1');

  return (
    <TableRow hoverable>
      <TableCell type="checkbox" checked={checked} onCheckedChange={onCheckedChange} />
      <TableCell
        type="primary"
        primaryText={row.invoiceNumber}
        showSubtext={false}
        onPrimaryClick={onDetails}
      />
      <TableCell value={row.candidateName} />
      <TableCell className="cd-col-hide" value={row.candidateEmail || '—'} />
      <TableCell type="number" value={fmtINR(row.total)} />
      <TableCell className="cd-col-hide" value={dt.date} />
      <TableCell
        type="status"
        statusLabel={row.status === 'paid' ? 'Paid' : row.status}
        statusVariant={row.status === 'paid' ? 'Success' : 'Failure'}
      />
      <TableCell value={
        <RowMenu isOpen={isOpen} onOpen={onOpen} onClose={onClose} onDetails={onDetails} download={download} />
      } />
    </TableRow>
  );
}


/* ---------- Invoice detail side panel — 1:1 with Recriauth's
   invoice-detail-dialog.tsx (client/modules/client/invoices/components) ---- */

const SELLER_PARTY = [
  'Recrivio Technologies Private Limited',
  'Ram Ganga Nagar, Awas Yojana M.O 2, R.K. University, Bareilly, Uttar Pradesh, India, 243006',
  'support@recrivio.com',
  '+91 9084693702',
  'GSTIN: 09AAOCR5701J1Z0',
  'PAN: AAOCR5701J',
  'CIN: U78300UP2025PTC222138',
];

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-[250px] text-sm font-medium leading-5 text-text-subheading">
        {label}
      </span>
      <span className="whitespace-nowrap text-sm font-medium leading-5 text-text-body">
        {value}
      </span>
    </div>
  );
}

function PartyBlock({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div className="flex w-[250px] flex-col gap-1">
      <span className="text-body-sm font-medium leading-5 text-text-subheading">
        {label}
      </span>
      <div className="flex flex-col text-body-sm font-medium leading-5 text-text-body">
        {lines.map((line, idx) => (
          <span key={idx}>{line}</span>
        ))}
      </div>
    </div>
  );
}

function fmtDetailDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} | ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function fmtDetailDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function InvoiceDetailsDialog({
  row,
  onClose,
}: {
  row: AdminInvoiceRow | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<InvoiceDetailResponse | null>(null);

  useEffect(() => {
    if (!row) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    invoiceDetail(row.id)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [row]);

  // Plain fixed slide-over — guaranteed visible. (The RDS DialogBox's enter
  // transition wasn't firing here, leaving the panel translated off-screen.)
  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [row, onClose]);

  if (!row) return null;
  const download = row.pdfUrl ?? invoicePrintUrl(row.id) + '?download=1';

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-neutral-900/30"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-[720px] flex-col bg-white shadow-2xl">
        <div className="flex-1 overflow-y-auto p-5">
          <InvoiceDetailBody row={row} detail={detail} />
        </div>
        <div className="flex justify-end gap-2 border-t border-border-default p-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => window.open(download, '_blank', 'noopener')}
          >
            Download Invoice
          </Button>
        </div>
      </div>
    </div>
  );
}

function InvoiceDetailBody({
  row,
  detail,
}: {
  row: AdminInvoiceRow;
  detail: InvoiceDetailResponse | null;
}) {
  // Render from the row we already have (always available) and enrich with the
  // fetched detail when it arrives — the panel must never gate on the fetch.
  const isPaid = row.status === 'paid';
  const subtotal = detail ? detail.subtotal : Math.round((row.total / 1.18) * 100) / 100;
  const gst = detail ? detail.tax : Math.round((row.total - subtotal) * 100) / 100;
  const total = detail ? detail.total : row.total;
  const gstRate = detail ? detail.taxRatePercent : 18;
  const invoiceDate = detail?.paidAt ?? detail?.createdAt ?? row.paidAt;
  const razorpayId = detail?.razorpayPaymentId ?? row.razorpayPaymentId;
  const buyerLines = [
    row.clientName,
    row.clientEmail,
    'GSTIN: Unregistered',
  ].filter(Boolean) as string[];
  const items =
    detail?.lineItems && detail.lineItems.length > 0
      ? detail.lineItems.map((it) => ({
          description: it.description ?? 'Background verification services',
          amount: Number(it.total ?? it.lineSubtotal ?? 0),
        }))
      : [
          {
            description: `Assurio verification${row.candidateName ? ` · ${row.candidateName}` : ''}`,
            amount: subtotal,
          },
        ];

  return (
      <>
        {/* Header: invoice number + status chip */}
        <div className="flex items-center gap-2">
          <h2 className="text-h3 font-semibold leading-[31px] tracking-[-0.25px] text-text-heading">
            #{row.invoiceNumber}
          </h2>
          <Tag
            className="px-[12px] py-[4px]"
            variant={isPaid ? 'Success' : 'Warning'}
            label={isPaid ? 'Paid' : 'Payment Due'}
          />
        </div>

        <div className="flex flex-col gap-8">
          {/* Key-value rows */}
          <div className="flex flex-col gap-2">
            <KeyValueRow label="Invoice No." value={row.invoiceNumber} />
            <KeyValueRow label="Invoice Date" value={fmtDetailDate(invoiceDate)} />
            <KeyValueRow
              label="Payment Terms"
              value={isPaid ? 'Paid on Receipt' : 'Due on Receipt'}
            />
          </div>

          {/* Billed By / Billed To */}
          <div className="flex gap-5">
            <PartyBlock label="Billed By" lines={SELLER_PARTY} />
            <PartyBlock label="Billed To" lines={buyerLines} />
          </div>

          {/* Billing Summary */}
          <div className="flex flex-col gap-3">
            <h3 className="text-subtitle-md font-semibold leading-6 text-text-body">
              Billing Summary
            </h3>
            <div className="overflow-hidden rounded-lg">
              <div className="flex bg-neutral-100">
                <div className="flex-1 px-3 py-[13px] text-body-sm font-medium leading-5 text-text-body">
                  Item Description
                </div>
                <div className="w-[130px] px-3 py-[13px] text-right text-body-sm font-medium leading-5 text-text-body">
                  Total Amount
                </div>
              </div>
              <div className="py-1">
                {items.map((it, idx) => (
                  <div key={idx} className="flex items-center">
                    <div className="flex-1 px-3 py-1 text-body-md leading-[22px] text-text-body">
                      {it.description}
                    </div>
                    <div className="w-[130px] px-3 py-1 text-right text-body-md leading-[22px] text-text-body">
                      {fmtINR(it.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 pb-2">
              <Divider orientation="Horizontal" emphasis="Low" />
              <div className="flex items-center justify-between px-3 text-body-sm font-medium leading-5 text-text-body">
                <span>Subtotal</span>
                <span>{fmtINR(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between px-3 text-body-sm font-medium leading-5 text-text-body">
                <span>GST ({gstRate}%)</span>
                <span>{fmtINR(gst)}</span>
              </div>
              <Divider orientation="Horizontal" emphasis="Low" />
              <div className="flex items-center justify-between px-3 text-subtitle-md font-semibold leading-6 text-text-body">
                <span>{isPaid ? 'Total Paid' : 'Total Due'}</span>
                <span>{fmtINR(total)}</span>
              </div>
              <Divider orientation="Horizontal" emphasis="Low" />
            </div>
          </div>

          {/* Payment Information — PAID only */}
          {isPaid ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-subtitle-md font-semibold leading-6 text-text-body">
                Payment Information
              </h3>
              <div className="flex flex-col gap-2">
                <KeyValueRow label="Payment Mode" value="Razorpay" />
                {razorpayId ? (
                  <KeyValueRow label="Payment ID" value={razorpayId} />
                ) : null}
                <KeyValueRow
                  label="Payment Date & Time"
                  value={fmtDetailDateTime(invoiceDate)}
                />
              </div>
            </div>
          ) : null}
        </div>
      </>
  );
}

/* ---------- portal-rendered three-dot menu (escapes table overflow) ---------- */

function RowMenu({
  isOpen,
  onOpen,
  onClose,
  onDetails,
  download,
}: {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDetails: () => void;
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
            className="min-w-[180px] rounded-lg border border-border-default bg-white py-1 shadow-lg"
            role="menu"
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 60 }}
          >
            <button
              type="button"
              className="block w-full px-4 py-2 text-left text-body-md text-text-body hover:bg-neutral-200"
              onClick={() => { onClose(); onDetails(); }}
              role="menuitem"
            >
              More Details
            </button>
            <a
              href={download}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full px-4 py-2 text-left text-body-md text-text-body hover:bg-neutral-200"
              onClick={onClose}
              role="menuitem"
            >
              Download Invoice
            </a>
          </div>,
          document.body,
        )}
    </>
  );
}
