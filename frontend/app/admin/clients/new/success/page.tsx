'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  Mail,
  Phone,
  XCircle,
} from 'lucide-react';
import {
  invoicePrintUrl,
  me,
  verifyPaymentLink,
  type AuthUser,
  type InvoiceResponse,
} from '../../../../lib/api';
import { getToken } from '../../../../lib/session';
import { doLogout } from '../../../../lib/logout';
import { clearDraft, loadDraft, type ClientDraft } from '../draft';

const PRICE_INR = 399;

export default function SuccessPageWrapper() {
  return (
    <Suspense fallback={<div className="loading">Loading…</div>}>
      <SuccessPage />
    </Suspense>
  );
}

function SuccessPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [, setUser] = useState<AuthUser | null>(null);
  const [draft, setDraft] = useState<ClientDraft | null>(null);
  const [paymentId, setPaymentId] = useState<string>('');
  const [status, setStatus] = useState<'verifying' | 'failed' | 'ok'>('verifying');
  const [error, setError] = useState('');
  const [invoice, setInvoice] = useState<InvoiceResponse | null>(null);

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

        const razorpay_payment_id = search.get('razorpay_payment_id') || '';
        const razorpay_payment_link_id =
          search.get('razorpay_payment_link_id') || '';
        const razorpay_payment_link_reference_id =
          search.get('razorpay_payment_link_reference_id') || '';
        const razorpay_payment_link_status =
          search.get('razorpay_payment_link_status') || '';
        const razorpay_signature = search.get('razorpay_signature') || '';

        if (
          !razorpay_payment_id ||
          !razorpay_payment_link_id ||
          razorpay_payment_link_status !== 'paid'
        ) {
          setStatus('failed');
          setError(
            razorpay_payment_link_status
              ? 'Payment was ' + razorpay_payment_link_status + '.'
              : 'Missing Razorpay callback. Try the payment again.',
          );
          return;
        }

        const verification = await verifyPaymentLink(token, {
          razorpay_payment_id,
          razorpay_payment_link_id,
          razorpay_payment_link_reference_id,
          razorpay_payment_link_status,
          razorpay_signature,
        });
        if (cancelled) return;
        if (!verification.verified) {
          setStatus('failed');
          setError(
            'We could not verify this payment. Contact support if you were charged.',
          );
          return;
        }
        if (verification.invoice) setInvoice(verification.invoice);
        setPaymentId(razorpay_payment_id);
        const d = loadDraft();
        if (d) setDraft(d);
        setStatus('ok');
      } catch (err) {
        if (cancelled) return;
        setStatus('failed');
        setError(err instanceof Error ? err.message : 'Verification failed.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, search]);

  function done() {
    clearDraft();
    router.replace('/admin/clients');
  }

  function addAnother() {
    clearDraft();
    router.push('/admin/clients/new');
  }

  if (status === 'verifying') {
    return (
      <div className="suc">
        <main className="suc-main">
          <div className="suc-card">
            <div className="suc-seal">
              <span className="co-spinner" style={{ borderColor: 'rgba(47,102,73,0.35)', borderTopColor: '#2f6649', width: 28, height: 28 }} />
            </div>
            <h1 className="suc-title">
              Verifying <em>payment</em>
            </h1>
            <p className="suc-sub">Confirming with Razorpay. One moment…</p>
          </div>
        </main>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="suc">
        <main className="suc-main">
          <div className="suc-card">
            <div
              className="suc-seal"
              style={{ background: '#f1dcd6', borderColor: '#e7c3bb', color: '#9c3936' }}
            >
              <XCircle size={42} strokeWidth={1.6} />
            </div>
            <h1 className="suc-title">Payment <em>failed</em></h1>
            <p className="suc-sub">{error || 'The payment was not completed.'}</p>
            <div className="suc-actions">
              <Link href="/admin/clients/new" className="suc-btn">
                Try again
                <ArrowRight size={16} />
              </Link>
              <Link href="/admin/clients" className="suc-link">
                Back to clients
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="suc">
      <main className="suc-main">
        <div className="suc-card">
          <div className="suc-seal">
            <CheckCircle2 size={42} strokeWidth={1.6} />
          </div>

          <h1 className="suc-title">
            Payment <em>successful</em>
          </h1>
          <p className="suc-sub">
            {draft
              ? `${draft.name.split(' ')[0]} is now an Assurio client.`
              : 'Your payment was confirmed.'}
          </p>

          <div className="suc-amount">₹{PRICE_INR}</div>
          <div className="suc-ref">Ref · {paymentId}</div>

          {draft && (
            <div className="suc-meta">
              <div className="suc-meta-row">
                <span className="suc-meta-label">Client</span>
                <span className="suc-meta-value">{draft.name}</span>
              </div>
              <div className="suc-meta-row">
                <span className="suc-meta-label">
                  <Mail size={12} />
                  Email
                </span>
                <span className="suc-meta-value">{draft.email}</span>
              </div>
              <div className="suc-meta-row">
                <span className="suc-meta-label">
                  <Phone size={12} />
                  Phone
                </span>
                <span className="suc-meta-value">{draft.phone}</span>
              </div>
              <div className="suc-meta-row">
                <span className="suc-meta-label">Paid on</span>
                <span className="suc-meta-value">
                  {new Date().toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </div>
          )}

          {invoice && (
            <div className="inv">
              <div className="inv-head">
                <div>
                  <div className="inv-eyebrow">Tax invoice</div>
                  <div className="inv-no">{invoice.invoiceNumber}</div>
                </div>
                <a
                  href={invoicePrintUrl(invoice.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inv-download"
                >
                  <Download size={14} />
                  Download
                </a>
              </div>
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className="num">Qty</th>
                    <th className="num">Rate</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((li, i) => (
                    <tr key={i}>
                      <td>{li.description}</td>
                      <td className="num">{li.quantity}</td>
                      <td className="num">{fmtINR(li.rate)}</td>
                      <td className="num">{fmtINR(li.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="inv-totals">
                <div className="inv-totals-row">
                  <span>Subtotal</span>
                  <span>{fmtINR(invoice.subtotal)}</span>
                </div>
                <div className="inv-totals-row">
                  <span>GST ({invoice.taxRatePercent}%)</span>
                  <span>{fmtINR(invoice.tax)}</span>
                </div>
                <div className="inv-totals-row grand">
                  <span>Total Paid</span>
                  <span>{fmtINR(invoice.total)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="suc-actions">
            <button type="button" className="suc-btn" onClick={done}>
              Back to clients
              <ArrowRight size={16} />
            </button>
            <button type="button" className="suc-link" onClick={addAnother}>
              Add another
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function fmtINR(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
}
