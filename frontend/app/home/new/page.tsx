'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  FileText,
  Globe,
  IdCard,
  Landmark,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
  UserCog,
} from 'lucide-react';
import { me, type AuthUser } from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import { ICONS, type SidebarItem } from '../../components/Sidebar';
import AppShell from '../../components/AppShell';
import { saveDraft, type CandidateDraft } from './draft';
import TermsBox from '../../components/TermsBox';
import DobPicker from '../../components/DobPicker';

const CLIENT_NAV: SidebarItem[] = [
  { href: '/home', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/home/billing', label: 'Billing', icon: ICONS.billing },
];

const PRICE_INR = 399;

const ROLE_SUGGESTIONS = [
  'Maid',
  'Driver',
  'Cook',
  'Worker',
  'PG Tenant',
  'Office Staff',
  'Nanny',
  'Security',
];

const EMPTY: CandidateDraft = {
  name: '',
  email: '',
  phone: '',
  role: '',
  aadhaar: '',
  pan: '',
  dob: '',
  drivingLicense: '',
  voterId: '',
  passportFileNo: '',
  uan: '',
};

function formatAadhaar(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 12);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function formatPhone(input: string): string {
  return input.replace(/[^\d+]/g, '').slice(0, 14);
}

function formatUan(input: string): string {
  return input.replace(/\D/g, '').slice(0, 12);
}

export default function AddCandidatePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [form, setForm] = useState<CandidateDraft>(EMPTY);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState('');
  const [tcAgreed, setTcAgreed] = useState(false);

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

  function set<K extends keyof CandidateDraft>(
    key: K,
    value: CandidateDraft[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /* ── per-field validation ── */
  const nameValid = form.name.trim().length >= 2;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const phoneValid = form.phone === '' || form.phone.replace(/\D/g, '').length >= 10;

  const aadhaarDigits = form.aadhaar.replace(/\s/g, '');
  const aadhaarValid = /^\d{12}$/.test(aadhaarDigits);
  const panValid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan);
  const dobValid = form.dob === '' || /^\d{2}-\d{2}-\d{4}$/.test(form.dob);
  const dlValid = form.drivingLicense === '' || form.drivingLicense.length >= 5;
  const voterValid = form.voterId === '' || /^[A-Z]{3}\d{7}$/.test(form.voterId);
  const passportFileValid = form.passportFileNo === '' || form.passportFileNo.length >= 5;
  const uanValid = form.uan === '' || /^\d{12}$/.test(form.uan);

  /* ── step 1 → 2 ── */
  function handleNextContact() {
    setError('');
    if (!tcAgreed) return setError('Please agree to the Terms & Conditions to continue.');
    if (!nameValid) return setError("Please enter the candidate's name.");
    if (!emailValid) return setError('Please enter a valid email.');
    if (!phoneValid) return setError('Phone number looks too short.');
    setStep(2);
  }

  /* ── step 2 → 3 ── */
  function handleNextIdentity() {
    setError('');
    if (!aadhaarValid) return setError('Aadhaar must be 12 digits.');
    if (!panValid) return setError('PAN must match the format ABCDE1234F.');
    if (!dobValid) return setError('Date of birth must be in DD-MM-YYYY format.');
    if ((form.drivingLicense || form.passportFileNo) && !form.dob)
      return setError('Date of birth is required when providing a Driving Licence or Passport.');
    if (!dlValid) return setError('Driving licence number looks too short.');
    if (!voterValid) return setError('Voter ID must be in the format ABC1234567.');
    if (!passportFileValid) return setError('Passport file number looks too short.');
    if (!uanValid) return setError('UAN must be 12 digits.');
    setStep(3);
  }

  function goToCheckout() {
    saveDraft(form);
    router.push('/home/new/checkout');
  }

  if (!user) return <div className="loading">Loading…</div>;

  return (
    <AppShell nav={CLIENT_NAV} user={user} onLogout={handleLogout}>
        <div className="ac">
          <div className="ac-progress">
            <Link href="/home" className="ac-back">
              <ArrowLeft size={14} />
              Dashboard
            </Link>
            <div className="ac-steps">
              <StepDot
                n={1}
                label="Contact"
                state={step === 1 ? 'current' : 'done'}
              />
              <span className="ac-step-line" />
              <StepDot
                n={2}
                label="Identity"
                state={step === 1 ? 'pending' : step === 2 ? 'current' : 'done'}
              />
              <span className="ac-step-line" />
              <StepDot
                n={3}
                label="Review"
                state={step === 3 ? 'current' : 'pending'}
              />
            </div>
          </div>

          {/* ─── STEP 1 : Contact ─── */}
          {step === 1 && (
            <>
              <header className="ac-head">
                <h1 className="ac-title">
                  Add a new <em>candidate</em>
                </h1>
                <p className="ac-sub">
                  Capture contact details and accept T&amp;C before proceeding.
                </p>
              </header>

              <div className="ac-card">
                <SectionHead
                  icon={<User size={16} />}
                  title="Contact"
                  sub="How we reach the candidate."
                />
                <Field
                  id="ac-name"
                  label="Full name"
                  placeholder="e.g. Sunita Kumari"
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
                    placeholder="their@email.com"
                    value={form.email}
                    onChange={(v) => set('email', v)}
                    valid={emailValid}
                    icon={<Mail size={16} />}
                  />
                  <Field
                    id="ac-phone"
                    label="Phone (optional)"
                    placeholder="+91 98765 43210"
                    value={form.phone}
                    onChange={(v) => set('phone', formatPhone(v))}
                    valid={form.phone.length > 0 && phoneValid}
                    icon={<Phone size={16} />}
                  />
                </div>
                <RoleCombo
                  id="ac-role"
                  label="Role (optional)"
                  placeholder="e.g. Maid, PG Tenant, Driver"
                  value={form.role}
                  onChange={(v) => set('role', v)}
                  suggestions={ROLE_SUGGESTIONS}
                />

                <div className="ac-divider" />

                <TermsBox agreed={tcAgreed} onAgreedChange={setTcAgreed} />

                {error && <div className="ac-error">{error}</div>}

                <div className="ac-cta-row">
                  <div className="ac-cta-meta">
                    <Sparkles size={13} />
                    Encrypted and stored securely.
                  </div>
                  <button
                    className="ac-btn"
                    onClick={handleNextContact}
                    disabled={!nameValid || !emailValid || !tcAgreed}
                  >
                    Continue
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ─── STEP 2 : Identity ─── */}
          {step === 2 && (
            <>
              <header className="ac-head">
                <h1 className="ac-title">
                  Identity <em>documents</em>
                </h1>
                <p className="ac-sub">
                  All identity documents are required to run a complete background check.
                </p>
              </header>

              <div className="ac-card">
                <SectionHead
                  icon={<IdCard size={16} />}
                  title="Core IDs"
                  sub="Required for verification."
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

                <div className="ac-divider" />

                <SectionHead
                  icon={<BadgeCheck size={16} />}
                  title="Other IDs"
                  sub="Optional — fill what's available."
                />
                <DobPicker
                  value={form.dob}
                  onChange={(v) => set('dob', v)}
                  label="Date of birth (required for DL & Passport)"
                />
                <div className="ac-grid-2">
                  <Field
                    id="ac-dl"
                    label="Driving licence no."
                    placeholder="e.g. MH0120201234567"
                    value={form.drivingLicense}
                    onChange={(v) =>
                      set('drivingLicense', v.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                    }
                    maxLength={20}
                    valid={dlValid}
                    icon={<Car size={16} />}
                  />
                  <Field
                    id="ac-voter"
                    label="Voter ID"
                    placeholder="e.g. ABC1234567"
                    value={form.voterId}
                    onChange={(v) =>
                      set('voterId', v.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                    }
                    maxLength={10}
                    valid={voterValid}
                    icon={<Landmark size={16} />}
                  />
                  <Field
                    id="ac-passport-file"
                    label="Passport file no. (optional)"
                    placeholder="e.g. AP1234567890"
                    value={form.passportFileNo}
                    onChange={(v) =>
                      set('passportFileNo', v.toUpperCase().replace(/[^A-Z0-9/]/g, ''))
                    }
                    maxLength={20}
                    valid={passportFileValid && form.passportFileNo.length > 0}
                    icon={<Globe size={16} />}
                  />
                  <Field
                    id="ac-uan"
                    label="UAN"
                    placeholder="12-digit UAN"
                    value={form.uan}
                    onChange={(v) => set('uan', formatUan(v))}
                    maxLength={12}
                    valid={uanValid}
                    icon={<Briefcase size={16} />}
                  />
                </div>

                {error && <div className="ac-error">{error}</div>}

                <div className="ac-cta-row">
                  <button
                    type="button"
                    className="ac-link"
                    onClick={() => { setError(''); setStep(1); }}
                  >
                    <ArrowLeft size={13} />
                    Back
                  </button>
                  <button
                    className="ac-btn"
                    onClick={handleNextIdentity}
                    disabled={!aadhaarValid || !panValid || !dlValid || !voterValid || !passportFileValid || !uanValid}
                  >
                    Continue
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ─── STEP 3 : Review & Pay ─── */}
          {step === 3 && (
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
                  icon={<User size={16} />}
                  title="Contact"
                  sub="Personal details."
                />
                <SummaryRow label="Name" value={form.name} />
                <SummaryRow label="Email" value={form.email} />
                {form.phone && <SummaryRow label="Phone" value={form.phone} />}
                {form.role && <SummaryRow label="Role" value={form.role} />}

                <div className="ac-divider" />

                <SectionHead
                  icon={<IdCard size={16} />}
                  title="Identity"
                  sub="Documents provided."
                />
                <SummaryRow
                  label="Aadhaar"
                  value={'XXXX XXXX ' + aadhaarDigits.slice(-4)}
                />
                <SummaryRow label="PAN" value={form.pan} />
                {form.dob && <SummaryRow label="Date of birth" value={form.dob} />}
                <SummaryRow label="Driving licence" value={form.drivingLicense} />
                <SummaryRow label="Voter ID" value={form.voterId} />
                {form.passportFileNo && (
                  <SummaryRow label="Passport file no." value={form.passportFileNo} />
                )}
                <SummaryRow label="UAN" value={form.uan} />

                <div className="ac-divider" />

                <div className="ac-price">
                  <div className="ac-price-meta">
                    <div className="ac-price-label">Verification fee</div>
                    <div className="ac-price-sub">
                      {[
                        'PAN',
                        'Aadhaar (DigiLocker)',
                        form.drivingLicense ? 'Driving licence' : null,
                        form.voterId ? 'Voter ID' : null,
                        form.passportFileNo ? 'Passport' : null,
                        form.uan ? 'Employment history (UAN)' : null,
                        'Crime check',
                      ].filter(Boolean).join(' · ')}
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
                    onClick={() => { setError(''); setStep(2); }}
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
  list,
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
  list?: string;
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
          list={list}
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

function RoleCombo({
  id,
  label,
  value,
  onChange,
  placeholder,
  suggestions,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suggestions: string[];
}) {
  const trimmed = value.trim();
  const isCustom =
    trimmed.length > 0 &&
    !suggestions.some((s) => s.toLowerCase() === trimmed.toLowerCase());

  const [open, setOpen] = useState(false);
  // Custom-input mode is sticky once toggled, so the user can clear & re-type.
  const [customMode, setCustomMode] = useState(isCustom);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function pick(v: string) {
    onChange(v);
    setCustomMode(false);
    setOpen(false);
  }

  function startCustom() {
    setCustomMode(true);
    setOpen(false);
    // focus the custom input on next paint
    setTimeout(() => customInputRef.current?.focus(), 0);
  }

  function onTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, suggestions.length)); // include "Other"
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active < suggestions.length) pick(suggestions[active]);
      else startCustom();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const valid = trimmed.length > 0;
  // Trigger label: in custom mode, always say "Other (custom)" — the real value
  // shows up in the input below. In preset mode, show the picked role / placeholder.
  const triggerText = customMode
    ? 'Other (custom)'
    : trimmed || placeholder || 'Select a role';
  const triggerIsPlaceholder = !customMode && !trimmed;

  return (
    <div className="ac-field ac-combo" ref={wrapRef}>
      <label className="ac-field-label">{label}</label>

      <button
        type="button"
        id={id}
        className={`ac-combo-trigger ${valid ? 'is-valid' : ''} ${
          open ? 'is-open' : ''
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
      >
        <span className="ac-input-ico">
          {customMode ? <Sparkles size={16} /> : <UserCog size={16} />}
        </span>
        <span
          className={`ac-combo-value ${triggerIsPlaceholder ? 'is-placeholder' : ''}`}
        >
          {triggerText}
        </span>
        <ChevronDown size={16} className="ac-combo-chev" />
      </button>

      {open && (
        <div className="ac-combo-pop" role="presentation">
          <ul
            id={`${id}-listbox`}
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            className="ac-combo-list"
            onKeyDown={onListKey}
          >
            {suggestions.map((s, i) => {
              const isSelected =
                !customMode && s.toLowerCase() === trimmed.toLowerCase();
              return (
                <li
                  key={s}
                  role="option"
                  aria-selected={isSelected}
                  className={`ac-combo-option ${
                    i === active ? 'is-active' : ''
                  } ${isSelected ? 'is-selected' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(s);
                  }}
                >
                  <span>{s}</span>
                  {isSelected && <Check size={14} />}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className={`ac-combo-other ${
              active === suggestions.length ? 'is-active' : ''
            } ${customMode ? 'is-selected' : ''}`}
            onMouseEnter={() => setActive(suggestions.length)}
            onMouseDown={(e) => {
              e.preventDefault();
              startCustom();
            }}
          >
            <Sparkles size={13} />
            Other (type a custom role)
            {customMode && <Check size={13} />}
          </button>
        </div>
      )}

      {customMode && (
        <div className={`ac-input ac-combo-custom-input ${valid ? 'is-valid' : ''}`}>
          <span className="ac-input-ico">
            <UserCog size={16} />
          </span>
          <input
            ref={customInputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Type a custom role"
            autoComplete="off"
            maxLength={48}
          />
          {valid && (
            <span className="ac-input-ok">
              <Check size={15} />
            </span>
          )}
        </div>
      )}
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
