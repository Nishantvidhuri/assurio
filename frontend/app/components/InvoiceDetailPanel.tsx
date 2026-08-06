'use client';

/**
 * Invoice detail slide-over — a plain fixed panel (not the RDS DialogBox, whose
 * enter transition was leaving it off-screen here). Fetches the full invoice by
 * id and renders the Recriauth-style detail: Invoice No./Date/Terms, Billed By
 * (Assurio) / Billed To (the client), Billing Summary, Payment Information, and
 * a Download Invoice action. Shared by the global payments page and the
 * per-client invoices ledger.
 */
import { useEffect, useState } from 'react';
import { Button, Divider, Loader, Tag } from '@/shared/components/ui';
import {
  invoiceDetail,
  invoicePrintUrl,
  type InvoiceDetailResponse,
} from '../lib/api';

const SELLER_PARTY = [
  'Recrivio Technologies Private Limited',
  'Ram Ganga Nagar, Awas Yojana M.O 2, R.K. University, Bareilly, Uttar Pradesh, India, 243006',
  'support@recrivio.com',
  '+91 9084693702',
  'GSTIN: 09AAOCR5701J1Z0',
  'PAN: AAOCR5701J',
  'CIN: U78300UP2025PTC222138',
];

function fmtINR(n: number): string {
  return (
    '₹' +
    (Number.isFinite(n) ? n : 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} | ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

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

function InvoiceDetailBody({ detail }: { detail: InvoiceDetailResponse }) {
  const isPaid = detail.status === 'paid';
  const invoiceDate = detail.paidAt ?? detail.createdAt;
  // Billed To = the client (buyer); the stored customer is the verified candidate.
  const client = detail.buyer ?? {
    name: detail.customer.name,
    email: detail.customer.email,
    phone: detail.customer.phone,
  };
  const buyerLines = [
    client.name,
    client.email ?? '',
    ...(client.phone ? [client.phone] : []),
    'GSTIN: Unregistered',
  ].filter(Boolean) as string[];
  const candidate = detail.customer?.name?.trim();
  const items =
    detail.lineItems && detail.lineItems.length > 0
      ? detail.lineItems.map((it) => ({
          description: candidate
            ? `Assurio verification · ${candidate}`
            : it.description ?? 'Background verification services',
          amount: Number(it.total ?? it.lineSubtotal ?? 0),
        }))
      : [
          {
            description: candidate
              ? `Assurio verification · ${candidate}`
              : 'Background verification services',
            amount: detail.subtotal,
          },
        ];

  return (
    <div className="flex flex-col gap-5">
      {/* Header: invoice number + status chip */}
      <div className="flex items-center gap-2">
        <h2 className="text-h3 font-semibold leading-[31px] tracking-[-0.25px] text-text-heading">
          #{detail.invoiceNumber}
        </h2>
        <Tag
          className="px-[12px] py-[4px]"
          variant={isPaid ? 'Success' : 'Warning'}
          label={isPaid ? 'Paid' : 'Payment Due'}
        />
      </div>

      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <KeyValueRow label="Invoice No." value={detail.invoiceNumber} />
          <KeyValueRow label="Invoice Date" value={fmtDate(invoiceDate)} />
          <KeyValueRow
            label="Payment Terms"
            value={isPaid ? 'Paid on Receipt' : 'Due on Receipt'}
          />
        </div>

        <div className="flex gap-5">
          <PartyBlock label="Billed By" lines={SELLER_PARTY} />
          <PartyBlock label="Billed To" lines={buyerLines} />
        </div>

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
              <span>{fmtINR(detail.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between px-3 text-body-sm font-medium leading-5 text-text-body">
              <span>GST ({detail.taxRatePercent}%)</span>
              <span>{fmtINR(detail.tax)}</span>
            </div>
            <Divider orientation="Horizontal" emphasis="Low" />
            <div className="flex items-center justify-between px-3 text-subtitle-md font-semibold leading-6 text-text-body">
              <span>{isPaid ? 'Total Paid' : 'Total Due'}</span>
              <span>{fmtINR(detail.total)}</span>
            </div>
            <Divider orientation="Horizontal" emphasis="Low" />
          </div>
        </div>

        {isPaid ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-subtitle-md font-semibold leading-6 text-text-body">
              Payment Information
            </h3>
            <div className="flex flex-col gap-2">
              <KeyValueRow label="Payment Mode" value="Razorpay" />
              {detail.razorpayPaymentId ? (
                <KeyValueRow label="Payment ID" value={detail.razorpayPaymentId} />
              ) : null}
              <KeyValueRow
                label="Payment Date & Time"
                value={fmtDateTime(invoiceDate)}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function InvoiceDetailPanel({
  invoiceId,
  onClose,
}: {
  invoiceId: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<InvoiceDetailResponse | null>(null);

  useEffect(() => {
    if (!invoiceId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    invoiceDetail(invoiceId)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch(() => {
        /* keep the panel open with a spinner rather than crashing */
      });
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  useEffect(() => {
    if (!invoiceId) return;
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
  }, [invoiceId, onClose]);

  if (!invoiceId) return null;

  const download = detail?.pdfUrl ?? invoicePrintUrl(invoiceId) + '?download=1';

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-neutral-900/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-[720px] flex-col bg-white shadow-2xl">
        <div className="flex-1 overflow-y-auto p-5">
          {detail ? (
            <InvoiceDetailBody detail={detail} />
          ) : (
            <div className="flex h-64 items-center justify-center">
              <Loader />
            </div>
          )}
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
