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
import { BRAND } from '../../lib/brand';
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
  createWalletTopupOrder,
  getWallet,
  getWalletTransactions,
  invoicePrintUrl,
  me,
  myInvoices,
  verifyWalletTopup,
  type AuthUser,
  type InvoiceResponse,
  type WalletInfo,
  type WalletTxn,
} from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import { openRazorpayCheckout } from '../../lib/razorpay';
import { notifyWalletUpdated } from '../../components/WalletPill';
import { CLIENT_NAV } from '../../components/Sidebar';
import AppShell from '../../components/AppShell';
import StatCard from '../../components/StatCard';
import {
  Button,
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

const TXN_LABEL: Record<WalletTxn['reason'], string> = {
  TOPUP: 'Money added',
  VERIFICATION_CHARGE: 'Verification charge',
  CONSENT_REFUND: 'Refund — consent not given',
  ADMIN_CREDIT: 'Adjustment (credit)',
  ADMIN_DEBIT: 'Adjustment (debit)',
};


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

  // Wallet
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [walletTxns, setWalletTxns] = useState<WalletTxn[]>([]);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupMsg, setTopupMsg] = useState('');

  const refreshWallet = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const [w, t] = await Promise.all([
      getWallet(token),
      getWalletTransactions(token),
    ]);
    setWallet(w);
    setWalletTxns(t.items);
    // Keep the top-bar pill in sync with what this page just loaded.
    notifyWalletUpdated();
  }, []);

  async function addMoney() {
    setTopupMsg('');
    const amount = Number(topupAmount);
    if (!Number.isFinite(amount) || amount < 100) {
      setTopupMsg('Minimum top-up is ₹100.');
      return;
    }
    if (amount > 200000) {
      setTopupMsg('Maximum top-up is ₹2,00,000.');
      return;
    }
    const token = getToken();
    if (!token) return;
    setTopupBusy(true);
    try {
      const order = await createWalletTopupOrder(token, amount);
      if (!order.keyId) {
        throw new Error('Payments are not configured. Please contact support.');
      }
      let response;
      try {
        response = await openRazorpayCheckout({
          key: order.keyId,
          orderId: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: 'Recrify',
          description: 'Wallet top-up',
          prefill: {
            name: user?.name || 'Customer',
            email: user?.email || undefined,
          },
          themeColor: BRAND.ink,
        });
      } catch {
        // Modal dismissed — nothing was charged.
        return;
      }
      if (!response.razorpay_order_id || !response.razorpay_signature) {
        throw new Error('Payment could not be confirmed. Please try again.');
      }
      const res = await verifyWalletTopup(token, {
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      });
      if (!res.verified) {
        throw new Error(
          'We could not verify this payment. Contact support if you were charged.',
        );
      }
      setTopupAmount('');
      setTopupMsg(`₹${amount.toLocaleString('en-IN')} added to your wallet.`);
      await refreshWallet();
    } catch (err) {
      setTopupMsg(
        err instanceof Error ? err.message : 'Top-up failed. Please try again.',
      );
    } finally {
      setTopupBusy(false);
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
        if (u.role === 'admin') {
          router.replace('/admin');
          return;
        }
        if (u.role === 'candidate') {
          router.replace('/candidate');
          return;
        }
        setUser(u);
        const [list] = await Promise.all([
          myInvoices(token),
          refreshWallet().catch(() => undefined),
        ]);
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
  }, [router, refreshWallet]);

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

          {/* Stats — three across even on a phone (compact values there). */}
          <section className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatCard label="Total paid" value={fmtINR(stats.totalPaid)} />
            <StatCard label="Receipts" value={String(stats.count)} />
            <StatCard label="Avg per check" value={stats.avg ? fmtINR(stats.avg) : '—'} />
          </section>

          {/* Wallet */}
          <section className="flex flex-col gap-4 rounded-md border border-border-default bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-md bg-neutral-200 text-text-body">
                  <Wallet size={18} />
                </div>
                <div>
                  <div className="text-body-sm text-text-subheading">
                    Wallet balance
                  </div>
                  <div className="text-xl font-semibold text-text-heading">
                    {wallet ? fmtINR(wallet.balanceInr) : '—'}
                  </div>
                </div>
              </div>
              {/* Full-width top-up row on phones, inline from sm up. */}
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                  <Input
                    id="wallet-topup"
                    type="number"
                    placeholder="Amount (₹)"
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(e.target.value)}
                    min={100}
                    className="w-full"
                  />
                </div>
                <Button
                  variant="primary"
                  className="shrink-0"
                  onClick={() => void addMoney()}
                  isLoading={topupBusy}
                  disabled={topupBusy || !topupAmount}
                >
                  Add money
                </Button>
              </div>
            </div>
            <p className="text-body-sm text-text-subheading">
              Your balance pays for new verifications instantly. If a candidate
              declines consent — or doesn&apos;t respond within 7 days — the full
              charge is refunded here automatically.
            </p>
            {topupMsg && (
              <Callout
                state={topupMsg.includes('added') ? 'Success' : 'Error'}
                title={topupMsg}
                showAction={false}
                showCloseIcon={false}
                multiline
              />
            )}
            {/* Phone: the 4-column ledger becomes a compact stacked list. */}
            {walletTxns.length > 0 && (
              <ul className="flex flex-col divide-y divide-border-default border-t border-border-default md:hidden">
                {walletTxns.slice(0, 10).map((t) => {
                  const credit = t.type === 'CREDIT';
                  return (
                    <li key={t.id} className="flex items-start gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-body-md text-text-body">
                          {TXN_LABEL[t.reason] ?? t.reason}
                        </div>
                        <div className="text-body-sm text-text-subheading">
                          {fmtDate(t.createdAt).date}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div
                          className={`whitespace-nowrap font-medium ${credit ? 'text-success' : 'text-text-body'}`}
                        >
                          {credit ? '+' : '−'}
                          {fmtINR(t.amountPaise / 100)}
                        </div>
                        <div className="whitespace-nowrap text-body-sm text-text-subheading">
                          Bal {fmtINR(t.balanceAfterPaise / 100)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {walletTxns.length > 0 && (
              <Table bordered className="hidden md:block">
                <TableHeader>
                  <TableRow hoverable={false}>
                    <TableHeaderCell label="Date" roundedLeft />
                    <TableHeaderCell label="Activity" />
                    <TableHeaderCell type="number" label="Amount" className="text-right" />
                    <TableHeaderCell
                      type="number"
                      label="Balance"
                      className="text-right"
                      roundedRight
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {walletTxns.slice(0, 10).map((t) => {
                    const dt = fmtDate(t.createdAt);
                    const credit = t.type === 'CREDIT';
                    return (
                      <TableRow key={t.id} hoverable={false}>
                        <TableCell
                          type="default"
                          value={
                            <span className="whitespace-nowrap text-body-md text-text-body">
                              {dt.date}
                            </span>
                          }
                        />
                        <TableCell
                          type="default"
                          value={
                            <div className="min-w-0">
                              <div className="text-body-md text-text-body">
                                {TXN_LABEL[t.reason] ?? t.reason}
                              </div>
                              {t.note && (
                                <div className="truncate text-body-sm text-text-subheading">
                                  {t.note}
                                </div>
                              )}
                            </div>
                          }
                        />
                        <TableCell
                          type="number"
                          value={
                            <span
                              className={`font-medium ${credit ? 'text-success' : 'text-text-body'}`}
                            >
                              {credit ? '+' : '−'}
                              {fmtINR(t.amountPaise / 100)}
                            </span>
                          }
                        />
                        <TableCell
                          type="number"
                          value={
                            <span className="text-text-subheading">
                              {fmtINR(t.balanceAfterPaise / 100)}
                            </span>
                          }
                        />
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>

          {/* Toolbar */}
          {invoices.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="w-full min-w-0 md:max-w-md md:flex-1">
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
              {/* Count is desktop-only noise on a phone. */}
              <div className="hidden shrink-0 text-body-sm font-medium text-text-subheading md:block">
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
            <>
            {/* Phone: receipts as cards — the 6-column table can't fit. */}
            <div className="flex flex-col gap-3 md:hidden">
              {invoices.length === 0 ? (
                <div className="rounded-md border border-border-default bg-white p-6 text-center text-body-md text-text-subheading">
                  No receipts yet. Once you pay for a candidate verification, the
                  receipt will show up here for download.
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-md border border-border-default bg-white p-6 text-center text-body-md text-text-subheading">
                  No receipts match{' '}
                  <strong className="text-text-body">&ldquo;{query}&rdquo;</strong>.
                </div>
              ) : (
                filtered.map((inv) => {
                  const dt = fmtDate(inv.paidAt);
                  return (
                    <div
                      key={`m-${inv.id}`}
                      className="rounded-xl border border-border-default bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-body-md font-medium text-text-body">
                            {inv.customer?.name || '—'}
                          </div>
                          <div className="mt-0.5 font-mono text-body-sm text-text-subheading">
                            {inv.invoiceNumber}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="whitespace-nowrap font-semibold text-text-heading">
                            {fmtINR(inv.total)}
                          </div>
                          <div className="mt-1">
                            <Tag
                              variant={statusVariant(inv.status)}
                              label={inv.status}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-default pt-3">
                        <span className="text-body-sm text-text-subheading">
                          {dt.date}
                        </span>
                        <span className="flex items-center gap-4">
                          <a
                            href={invoicePrintUrl(inv.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-body-sm font-medium text-text-link"
                          >
                            <Eye size={14} /> Preview
                          </a>
                          <a
                            href={invoicePrintUrl(inv.id) + '?download=1'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-body-sm font-medium text-text-link"
                          >
                            <Download size={14} /> Download
                          </a>
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <Table bordered className="hidden md:block">
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
            </>
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
