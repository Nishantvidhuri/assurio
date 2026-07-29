'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Mail,
  Phone,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  createSubject,
  invoicePrintUrl,
  me,
  verifyPaymentLink,
  type AuthUser,
  type InvoiceResponse,
  type Subject,
} from '../../../lib/api';
import { getToken } from '../../../lib/session';
import { doLogout } from '../../../lib/logout';
import { clearDraft, loadDraft } from '../draft';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@/shared/components/ui';

const PRICE_INR = 399;

export default function CandidateSuccessPageWrapper() {
  return (
    <Suspense fallback={<div className="loading">Loading…</div>}>
      <CandidateSuccessPage />
    </Suspense>
  );
}

function CandidateSuccessPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [, setUser] = useState<AuthUser | null>(null);
  const [paymentId, setPaymentId] = useState<string>('');
  const [status, setStatus] = useState<'verifying' | 'failed' | 'ok'>('verifying');
  const [error, setError] = useState('');
  const [invoice, setInvoice] = useState<InvoiceResponse | null>(null);
  const [created, setCreated] = useState<
    | (Subject & { emailSent?: boolean })
    | null
  >(null);
  const [copied, setCopied] = useState(false);

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
        if (u.role !== 'owner' && u.role !== 'admin') {
          router.replace('/login');
          return;
        }
        setUser(u);

        // Razorpay redirects here with these query params on success.
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

        // Verify on the server before doing anything irreversible.
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
        if (!d) {
          // Lost the draft (maybe a different tab) — payment is fine, but
          // we don't have data to create the candidate. Show a partial state.
          setStatus('ok');
          return;
        }

        // Guard against double-create on React StrictMode / re-renders
        const guardKey = 'assurio:created-for-' + razorpay_payment_id;
        if (sessionStorage.getItem(guardKey)) {
          const cached = sessionStorage.getItem('assurio:created');
          if (cached) {
            try {
              setCreated(JSON.parse(cached));
              setStatus('ok');
              return;
            } catch {
              /* fall through */
            }
          }
        }
        sessionStorage.setItem(guardKey, '1');

        const subject = await createSubject(token, {
          name: d.name.trim(),
          email: d.email.trim(),
          phone: d.phone.trim() || undefined,
          role: d.role.trim() || undefined,
          panNumber: d.pan.trim() || undefined,
          aadhaarNumber: d.aadhaar.replace(/\s/g, '').trim() || undefined,
        });
        if (cancelled) return;
        setCreated(subject);
        sessionStorage.setItem('assurio:created', JSON.stringify(subject));
        setStatus('ok');
      } catch (err) {
        if (cancelled) return;
        setStatus('failed');
        setError(
          err instanceof Error
            ? err.message
            : 'Could not finalise the candidate.',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, search]);

  async function copyInvite() {
    if (!created?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(created.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function done() {
    clearDraft();
    sessionStorage.removeItem('assurio:created');
    router.replace('/home');
  }

  function addAnother() {
    clearDraft();
    sessionStorage.removeItem('assurio:created');
    router.push('/home/new');
  }

  if (status === 'verifying') {
    return (
      <div className="suc">
        <main className="suc-main">
          <div className="suc-card">
            <div className="suc-seal">
              <span className="co-spinner" style={{ borderColor: 'rgba(5,150,105,0.35)', borderTopColor: '#059669', width: 28, height: 28 }} />
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
              style={{ background: '#fee2e2', borderColor: '#fecaca', color: '#dc2626' }}
            >
              <XCircle size={42} strokeWidth={1.6} />
            </div>
            <h1 className="suc-title">Payment <em>failed</em></h1>
            <p className="suc-sub">{error || 'The payment was not completed.'}</p>
            <div className="suc-actions">
              <Link href="/home/new" className="suc-btn">
                Try again
                <ArrowRight size={16} />
              </Link>
              <Link href="/home" className="suc-link">
                Back to dashboard
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
            {created ? (
              <BadgeCheck size={42} strokeWidth={1.6} />
            ) : (
              <CheckCircle2 size={42} strokeWidth={1.6} />
            )}
          </div>

          <h1 className="suc-title">
            Payment <em>successful</em>
          </h1>
          <p className="suc-sub">
            ₹{PRICE_INR} received. {created
              ? `${created.name.split(' ')[0]} has been added and invited.`
              : 'Your payment was confirmed.'}
          </p>

          <div className="suc-amount">₹{PRICE_INR}</div>
          {paymentId && <div className="suc-ref">Ref · {paymentId}</div>}

          {created && (
            <>
              <div className="suc-meta">
                <div className="suc-meta-row">
                  <span className="suc-meta-label">Candidate</span>
                  <span className="suc-meta-value">{created.name}</span>
                </div>
                <div className="suc-meta-row">
                  <span className="suc-meta-label">
                    <Mail size={12} />
                    Email
                  </span>
                  <span className="suc-meta-value">{created.email}</span>
                </div>
                {created.phone && (
                  <div className="suc-meta-row">
                    <span className="suc-meta-label">
                      <Phone size={12} />
                      Phone
                    </span>
                    <span className="suc-meta-value">{created.phone}</span>
                  </div>
                )}
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

              {created.inviteUrl && (
                <>
                  <div
                    className="ac-invite-label"
                    style={{ marginTop: 22, textAlign: 'left' }}
                  >
                    Invite link
                  </div>
                  <div className="ac-invite-box">
                    <code className="ac-invite-url">{created.inviteUrl}</code>
                    <button
                      type="button"
                      className="ac-invite-copy"
                      onClick={copyInvite}
                    >
                      {copied ? (
                        <>
                          <CheckCircle2 size={14} />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="ac-invite-tips">
                    <Sparkles size={12} />
                    {created.emailSent
                      ? 'We also emailed this link to ' + created.email
                      : 'Share this link directly with the candidate.'}
                    <a
                      href={created.inviteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ac-link ac-link-inline"
                    >
                      <ExternalLink size={11} />
                      Open in new tab
                    </a>
                  </div>
                </>
              )}
            </>
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

              <Table bordered className="bg-white">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell label="Description" />
                    <TableHeaderCell label="Qty" type="number" />
                    <TableHeaderCell label="Rate" type="number" />
                    <TableHeaderCell label="Amount" type="number" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.lineItems.map((li, i) => (
                    <TableRow key={i}>
                      <TableCell value={li.description} />
                      <TableCell type="number" value={li.quantity} />
                      <TableCell type="number" value={fmtINR(li.rate)} />
                      <TableCell type="number" value={fmtINR(li.total)} />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

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
              Back to dashboard
              <ArrowRight size={16} />
            </button>
            <button type="button" className="suc-link" onClick={addAnother}>
              Add another candidate
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
