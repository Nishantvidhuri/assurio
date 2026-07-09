'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { createPaymentLink, me, type AuthUser } from '../../../../lib/api';
import { getToken } from '../../../../lib/session';
import { doLogout } from '../../../../lib/logout';
import { loadDraft, maskAadhaar, type ClientDraft } from '../draft';

const PRICE_INR = 399;

export default function CheckoutPage() {
  const router = useRouter();
  const [, setUser] = useState<AuthUser | null>(null);
  const [draft, setDraft] = useState<ClientDraft | null>(null);
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
        if (u.role !== 'admin') {
          router.replace('/home');
          return;
        }
        setUser(u);
        const d = loadDraft();
        if (cancelled) return;
        if (!d) {
          router.replace('/admin/clients/new');
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
      const link = await createPaymentLink(token, {
        amount: PRICE_INR,
        description: `Assurio onboarding · ${draft.name}`,
        customer: {
          name: draft.name,
          email: draft.email,
          contact: draft.phone || undefined,
        },
        notes: {
          pan: draft.pan,
          aadhaar_masked: 'XXXX XXXX ' + aadhaarDigits.slice(-4),
          flow: 'admin-add-client',
        },
        callbackPath: '/admin/clients/new/success',
      });
      window.location.href = link.short_url;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not start the payment. Please try again.',
      );
      setCreating(false);
    }
  }

  if (!draft) return <div className="loading">Loading…</div>;

  return (
    <div className="co">
      <header className="co-bar">
        <Link href="/admin/clients/new" className="co-back">
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
              Onboarding · {draft.name.split(' ')[0]}
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
              <div className="co-side-customer-sub">{draft.email}</div>
              <div className="co-side-customer-sub">{draft.phone}</div>
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
            <h2 className="co-pane-title">
              Continue to <em>Razorpay</em>
            </h2>
            <p className="co-pane-sub">
              You&apos;ll be redirected to Razorpay&apos;s secure checkout to
              complete your payment. After payment, we&apos;ll bring you back
              to finalise the onboarding.
            </p>

            <div className="rp-card">
              <div className="rp-card-head">
                <span className="rp-card-mark">RZP</span>
                <div>
                  <div className="rp-card-title">Razorpay Checkout</div>
                  <div className="rp-card-sub">Cards · UPI · Netbanking · Wallets</div>
                </div>
              </div>
              <ul className="rp-card-list">
                <li>
                  <CheckCircle2 size={14} />
                  PCI-DSS Level 1 secure
                </li>
                <li>
                  <CheckCircle2 size={14} />
                  100+ payment methods
                </li>
                <li>
                  <CheckCircle2 size={14} />
                  No card details stored on Assurio
                </li>
              </ul>
            </div>

            {error && <div className="ac-error">{error}</div>}

            <button className="co-pay" onClick={payNow} disabled={creating}>
              {creating ? (
                <>
                  <span className="co-spinner" />
                  Redirecting to Razorpay…
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
