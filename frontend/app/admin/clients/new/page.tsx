'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  FileText,
  IdCard,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import { me, type AuthUser } from '../../../lib/api';
import { getToken } from '../../../lib/session';
import { doLogout } from '../../../lib/logout';
import { ICONS, type SidebarItem } from '../../../components/Sidebar';
import AppShell from '../../../components/AppShell';
import { saveDraft, type ClientDraft } from './draft';

const ADMIN_NAV: SidebarItem[] = [
  { href: '/admin', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/admin/clients', label: 'Clients', icon: ICONS.clients },
  { href: '/admin/invoices', label: 'Invoices', icon: ICONS.invoices },
  { href: '/admin/operations', label: 'Operations', icon: ICONS.operations },
  { href: '/admin/vendors', label: 'Vendors', icon: ICONS.vendors },
  { href: '/admin/test-verification', label: 'Test Verification', icon: ICONS.testVerification },
];

const PRICE_INR = 399;

const EMPTY: ClientDraft = {
  name: '',
  email: '',
  phone: '',
  aadhaar: '',
  pan: '',
};

function formatAadhaar(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 12);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function formatPhone(input: string): string {
  return input.replace(/[^\d+]/g, '').slice(0, 14);
}

export default function AddClientPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [form, setForm] = useState<ClientDraft>(EMPTY);
  const [step, setStep] = useState<1 | 2>(1);
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
      } catch {
        if (cancelled) return;
        doLogout(router);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleLogout() {
    doLogout(router);
  }

  function set<K extends keyof ClientDraft>(key: K, value: ClientDraft[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const aadhaarDigits = form.aadhaar.replace(/\s/g, '');
  const panValid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan);
  const aadhaarValid = /^\d{12}$/.test(aadhaarDigits);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const phoneValid = form.phone.replace(/\D/g, '').length >= 10;
  const nameValid = form.name.trim().length >= 2;
  const allValid = panValid && aadhaarValid && emailValid && phoneValid && nameValid;

  function handleNext() {
    setError('');
    if (!nameValid) return setError('Please enter the client’s full name.');
    if (!emailValid) return setError('Please enter a valid email.');
    if (!phoneValid) return setError('Please enter a valid phone number.');
    if (!aadhaarValid) return setError('Aadhaar must be 12 digits.');
    if (!panValid) return setError('PAN must match the format ABCDE1234F.');
    setStep(2);
  }

  function goToCheckout() {
    saveDraft(form);
    router.push('/admin/clients/new/checkout');
  }

  if (!user) return <div className="loading">Loading…</div>;

  return (
    <AppShell nav={ADMIN_NAV} user={user} onLogout={handleLogout}>
        <div className="ac">
          {/* Step indicator */}
          <div className="ac-progress">
            <Link href="/admin/clients" className="ac-back">
              <ArrowLeft size={14} />
              Clients
            </Link>
            <div className="ac-steps">
              <StepDot n={1} label="Details" state={step === 1 ? 'current' : 'done'} />
              <span className="ac-step-line" />
              <StepDot n={2} label="Review" state={step === 2 ? 'current' : 'pending'} />
              <span className="ac-step-line" />
              <StepDot n={3} label="Pay" state="pending" />
            </div>
          </div>

          {step === 1 && (
            <>
              <header className="ac-head">
                <h1 className="ac-title">
                  Add a new <em>client</em>
                </h1>
                <p className="ac-sub">
                  Capture KYC details to onboard a client to Assurio. A one-time
                  ₹{PRICE_INR} verification fee applies.
                </p>
              </header>

              <div className="ac-card">
                <SectionHead
                  icon={<User size={16} />}
                  title="Contact"
                  sub="How we reach them."
                />
                <Field
                  id="ac-name"
                  label="Full name"
                  placeholder="e.g. Sunita Sharma"
                  value={form.name}
                  onChange={(v) => set('name', v)}
                  valid={nameValid && form.name.length > 0}
                  icon={<User size={16} />}
                />
                <div className="ac-grid-2">
                  <Field
                    id="ac-email"
                    label="Email"
                    type="email"
                    placeholder="name@company.com"
                    value={form.email}
                    onChange={(v) => set('email', v)}
                    valid={emailValid}
                    icon={<Mail size={16} />}
                  />
                  <Field
                    id="ac-phone"
                    label="Phone"
                    placeholder="+91 98765 43210"
                    value={form.phone}
                    onChange={(v) => set('phone', formatPhone(v))}
                    valid={phoneValid}
                    icon={<Phone size={16} />}
                  />
                </div>

                <div className="ac-divider" />

                <SectionHead
                  icon={<IdCard size={16} />}
                  title="Identity"
                  sub="Used to verify the client. Never shared."
                />
                <div className="ac-grid-2">
                  <Field
                    id="ac-aadhaar"
                    label="Aadhaar number"
                    placeholder="XXXX XXXX XXXX"
                    value={form.aadhaar}
                    onChange={(v) => set('aadhaar', formatAadhaar(v))}
                    maxLength={14}
                    valid={aadhaarValid}
                    icon={<FileText size={16} />}
                  />
                  <Field
                    id="ac-pan"
                    label="PAN number"
                    placeholder="ABCDE1234F"
                    value={form.pan}
                    onChange={(v) =>
                      set('pan', v.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                    }
                    maxLength={10}
                    valid={panValid}
                    icon={<CreditCard size={16} />}
                  />
                </div>

                {error && <div className="ac-error">{error}</div>}

                <div className="ac-cta-row">
                  <div className="ac-cta-meta">
                    <Lock size={13} />
                    Encrypted and stored securely.
                  </div>
                  <button
                    className="ac-btn"
                    onClick={handleNext}
                    disabled={!allValid}
                  >
                    Continue
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <header className="ac-head">
                <h1 className="ac-title">
                  Review &amp; <em>continue</em>
                </h1>
                <p className="ac-sub">
                  Verify the details before proceeding to payment.
                </p>
              </header>

              <div className="ac-card">
                <SectionHead
                  icon={<BadgeCheck size={16} />}
                  title="Summary"
                  sub="Confirm before paying."
                />
                <SummaryRow label="Name" value={form.name} />
                <SummaryRow label="Email" value={form.email} />
                <SummaryRow label="Phone" value={form.phone} />
                <SummaryRow
                  label="Aadhaar"
                  value={'XXXX XXXX ' + aadhaarDigits.slice(-4)}
                />
                <SummaryRow label="PAN" value={form.pan} />

                <div className="ac-divider" />

                <div className="ac-price">
                  <div className="ac-price-meta">
                    <div className="ac-price-label">Onboarding fee</div>
                    <div className="ac-price-sub">
                      PAN + Aadhaar (DigiLocker) + Crime check
                    </div>
                  </div>
                  <div className="ac-price-value">₹{PRICE_INR}</div>
                </div>

                <div className="ac-secured">
                  <ShieldCheck size={13} />
                  Secured by Razorpay
                </div>

                <div className="ac-cta-row">
                  <button
                    type="button"
                    className="ac-link"
                    onClick={() => setStep(1)}
                  >
                    <ArrowLeft size={13} />
                    Edit details
                  </button>
                  <button className="ac-btn ac-btn-pay" onClick={goToCheckout}>
                    Proceed to pay ₹{PRICE_INR}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </AppShell>
  );
}

/* ---------- Subcomponents ---------- */

function StepDot({
  n,
  label,
  state,
}: {
  n: number;
  label: string;
  state: 'pending' | 'current' | 'done';
}) {
  return (
    <div className={`ac-step ${state}`}>
      <span className="ac-step-dot">
        {state === 'done' ? <CheckCircle2 size={14} /> : n}
      </span>
      <span className="ac-step-label">{label}</span>
    </div>
  );
}

function SectionHead({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <div className="ac-section-head">
      <span className="ac-section-ico">{icon}</span>
      <div>
        <div className="ac-section-title">{title}</div>
        <div className="ac-section-sub">{sub}</div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  valid,
  icon,
  type,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  valid?: boolean;
  icon?: React.ReactNode;
  type?: string;
}) {
  return (
    <div className="ac-field">
      <label htmlFor={id} className="ac-field-label">
        {label}
      </label>
      <div className={`ac-input ${valid ? 'is-valid' : ''}`}>
        {icon && <span className="ac-input-ico">{icon}</span>}
        <input
          id={id}
          type={type ?? 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
        />
        {valid && (
          <span className="ac-input-ok">
            <CheckCircle2 size={15} />
          </span>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="ac-sum-row">
      <span className="ac-sum-label">{label}</span>
      <span className="ac-sum-value">{value || '—'}</span>
    </div>
  );
}
