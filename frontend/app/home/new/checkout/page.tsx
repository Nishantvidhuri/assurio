'use client';
import PageLoader from '@/app/components/PageLoader';
import { BRAND } from '../../../lib/brand';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Lock,
  Pencil,
  ShieldCheck,
  XCircle,
  Zap,
} from 'lucide-react';
import { createOrder, me, type AuthUser } from '../../../lib/api';
import {
  openRazorpayCheckout,
  type RazorpaySuccess,
} from '../../../lib/razorpay';
import { getToken } from '../../../lib/session';
import { doLogout } from '../../../lib/logout';
import { loadDraft, maskAadhaar, type CandidateDraft } from '../draft';
import { missingLabels, performableEta, splitChecks } from '../checks';

const PRICE_INR = 399;

export default function CandidateCheckoutPage() {
  const router = useRouter();
  const [, setUser] = useState<AuthUser | null>(null);
  const [draft, setDraft] = useState<CandidateDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

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
        const d = loadDraft();
        if (cancelled) return;
        if (!d) {
          router.replace('/home/new');
          return;
        }
        setDraft(d);
      } catch {
        if (cancelled) return;
        doLogout(router);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function payNow() {
    if (!draft) return;
    setError('');
    setCreating(true);
    try {
      const token = getToken();
      if (!token) throw new Error('Session expired');

      const aadhaarDigits = draft.aadhaar.replace(/\s/g, '');
      const order = await createOrder(token, {
        amount: PRICE_INR,
        description: `Assurio verification · ${draft.name}`,
        customer: {
          name: draft.name,
          email: draft.email || undefined,
          contact: draft.phone || undefined,
        },
        notes: {
          pan: draft.pan,
          aadhaar_masked: 'XXXX XXXX ' + aadhaarDigits.slice(-4),
          flow: 'client-add-candidate',
        },
      });
      if (!order.keyId) {
        throw new Error('Payments are not configured. Please contact support.');
      }

      // Opens as an overlay on this page — the address bar stays on
      // /home/new/checkout; no redirect to Razorpay's hosted page.
      let response: RazorpaySuccess;
      try {
        response = await openRazorpayCheckout({
          key: order.keyId,
          orderId: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: 'Assurio',
          description: `Verification · ${draft.name}`,
          prefill: {
            name: draft.name,
            email: draft.email || undefined,
            contact: draft.phone || undefined,
          },
          themeColor: BRAND.ink,
        });
      } catch {
        // User dismissed the modal — stay on the page, let them retry.
        setCreating(false);
        return;
      }

      if (!response.razorpay_order_id || !response.razorpay_signature) {
        throw new Error('Payment could not be confirmed. Please try again.');
      }

      // Payment captured on our page — hand the signed result to the success
      // page for server verification + candidate creation.
      const qs = new URLSearchParams({
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      });
      router.push(`/home/new/success?${qs.toString()}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not start the payment. Please try again.',
      );
      setCreating(false);
    }
  }

  if (!draft) return <PageLoader />;
  const aadhaarDigits = draft.aadhaar.replace(/\s/g, '');
  const { performable, blocked } = splitChecks(draft);

  return (
    <div className="co">
      <header className="co-bar">
        <Link href="/home/new" className="co-back">
          <ArrowLeft size={16} />
          Back
        </Link>
        <div className="co-bar-brand">
          <span className="co-mark">A</span>
          Assurio
        </div>
        <div className="co-bar-secure">
          <Lock size={13} />
          Secure
        </div>
      </header>

      <main className="co-main">
        <div className="co-grid">
          <aside className="co-side">
            <div className="co-side-chip">
              <ShieldCheck size={13} />
              Order summary
            </div>
            <h1 className="co-side-amount">₹{PRICE_INR}</h1>
            <p className="co-side-amount-sub">
              Verification · {draft.name.split(' ')[0]}
            </p>

            <div className="co-side-rows">
              <div className="co-side-row">
                <span>PAN verification</span>
                <span>Included</span>
              </div>
              <div className="co-side-row">
                <span>Aadhaar (DigiLocker)</span>
                <span>Included</span>
              </div>
              <div className="co-side-row">
                <span>Crime check</span>
                <span>Included</span>
              </div>
            </div>

            <div className="co-side-divider" />

            <div className="co-side-customer">
              <div className="co-side-customer-name">{draft.name}</div>
              {draft.email && (
                <div className="co-side-customer-sub">{draft.email}</div>
              )}
              {draft.phone && (
                <div className="co-side-customer-sub">{draft.phone}</div>
              )}
              <div className="co-side-customer-sub">
                {maskAadhaar(draft.aadhaar)} · {draft.pan}
              </div>
            </div>

            <div className="co-side-total">
              <span>Total</span>
              <span className="co-side-total-amt">₹{PRICE_INR}</span>
            </div>
          </aside>

          <section className="co-pane">
            <div className="co-checks">
              <div className="co-checks-head">
                <h2 className="co-checks-h">Review &amp; pay</h2>
                <p className="co-checks-sub">
                  Verify details before proceeding to payment.
                </p>
              </div>

              {performable.length > 0 && (
                <div className="co-checks-group">
                  <div className="co-checks-label">
                    Checks we&apos;ll perform
                  </div>
                  <div className="co-checks-list">
                    {performable.map((c) => {
                      const eta = performableEta(c);
                      return (
                        <div key={c.id} className="co-check co-check-ok">
                          <CheckCircle2 size={16} className="co-check-icon" />
                          <span className="co-check-name">{c.label}</span>
                          <span className="co-check-tag">
                            {eta === 'Instant on consent' ? (
                              <Zap size={11} />
                            ) : (
                              <Clock size={11} />
                            )}
                            {eta}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {blocked.length > 0 && (
                <div className="co-checks-group">
                  <div className="co-checks-label">
                    Checks we can&apos;t perform
                  </div>
                  <div className="co-checks-list">
                    {blocked.map((c) => (
                      <div key={c.id} className="co-check co-check-miss">
                        <XCircle size={16} className="co-check-icon" />
                        <span className="co-check-name">{c.label}</span>
                        <span className="co-check-missing">
                          {missingLabels(c.missing)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Link href="/home/new" className="co-checks-add">
                    <Pencil size={13} />
                    Add missing info to enable more checks
                  </Link>
                </div>
              )}
            </div>

            <div className="co-checks-divider" />

            {error && <div className="ac-error">{error}</div>}

            <button
              className="co-pay"
              onClick={payNow}
              disabled={creating}
            >
              {creating ? (
                <>
                  <span className="co-spinner" />
                  Opening secure checkout…
                </>
              ) : (
                <>
                  Pay ₹{PRICE_INR}
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            <div className="co-foot">
              <ShieldCheck size={13} />
              <span>
                Payments are processed by Razorpay (PCI-DSS Level 1). Test mode
                — use card <code className="rp-code">4111 1111 1111 1111</code>,
                any future expiry, any CVV.
              </span>
            </div>

            <a
              className="ac-link ac-link-inline"
              href="https://razorpay.com/docs/payments/payments/test-card-details/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginTop: 8 }}
            >
              <ExternalLink size={11} />
              See all test cards
            </a>
          </section>
        </div>
      </main>
    </div>
  );
}
