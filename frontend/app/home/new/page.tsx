'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { me, type AuthUser } from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import { ICONS, type SidebarItem } from '../../components/Sidebar';
import AppShell from '../../components/AppShell';
import { saveDraft, type CandidateDraft } from './draft';
import TermsBox from '../../components/TermsBox';
import {
  Button,
  Callout,
  DateInput,
  Divider,
  Input,
  InputFieldWrapper,
  PhoneInput,
  ProgressBar,
  SelectInput,
  Stepper,
  validatePhoneNumber,
  type StepperItem,
} from '@/shared/components/ui';

const CLIENT_NAV: SidebarItem[] = [
  { href: '/home', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/home/billing', label: 'Billing', icon: ICONS.billing },
];

const PRICE_INR = 399;

const ROLE_OPTIONS = [
  'Maid',
  'Driver',
  'Cook',
  'Worker',
  'PG Tenant',
  'Office Staff',
  'Nanny',
  'Security',
].map((role) => ({ label: role, value: role }));

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

function formatUan(input: string): string {
  return input.replace(/\D/g, '').slice(0, 12);
}

/* DOB is stored in the draft as a `DD-MM-YYYY` string; the RDS DateInput
 * works with Date objects, so we convert on the boundary. */
function dobStringToDate(dob: string): Date | undefined {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dob);
  if (!match) return undefined;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function dateToDobString(date: Date | undefined): string {
  if (!date) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${date.getFullYear()}`;
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
  const phoneValid =
    form.phone === '' || form.phone.replace(/\D/g, '').length >= 10;

  const aadhaarDigits = form.aadhaar.replace(/\s/g, '');
  const aadhaarValid = /^\d{12}$/.test(aadhaarDigits);
  const panValid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan);
  const dobValid = form.dob === '' || /^\d{2}-\d{2}-\d{4}$/.test(form.dob);
  const dlValid = form.drivingLicense === '' || form.drivingLicense.length >= 5;
  const voterValid = form.voterId === '' || /^[A-Z]{3}\d{7}$/.test(form.voterId);
  const passportFileValid =
    form.passportFileNo === '' || form.passportFileNo.length >= 5;
  const uanValid = form.uan === '' || /^\d{12}$/.test(form.uan);

  /* Inline field errors — shown only when a field has content but is
   * malformed, mirroring the Recriauth candidate form. Required-but-empty
   * fields stay gated by the disabled Continue button + aggregate error. */
  const emailError =
    form.email.length > 0 && !emailValid ? 'Enter a valid email.' : undefined;
  const phoneError =
    form.phone.length > 0 && !phoneValid
      ? validatePhoneNumber(form.phone) || 'Phone number looks too short.'
      : undefined;
  const aadhaarError =
    form.aadhaar.length > 0 && !aadhaarValid
      ? 'Aadhaar must be 12 digits.'
      : undefined;
  const panError =
    form.pan.length > 0 && !panValid
      ? 'PAN must match the format ABCDE1234F.'
      : undefined;
  const dobError = !dobValid ? 'Use DD-MM-YYYY.' : undefined;
  const dlError =
    form.drivingLicense.length > 0 && !dlValid
      ? 'Licence number looks too short.'
      : undefined;
  const voterError =
    form.voterId.length > 0 && !voterValid
      ? 'Voter ID must be in the format ABC1234567.'
      : undefined;
  const passportError =
    form.passportFileNo.length > 0 && !passportFileValid
      ? 'File number looks too short.'
      : undefined;
  const uanError =
    form.uan.length > 0 && !uanValid ? 'UAN must be 12 digits.' : undefined;

  /* ── step 1 → 2 ── */
  function handleNextContact() {
    setError('');
    if (!tcAgreed)
      return setError('Please agree to the Terms & Conditions to continue.');
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
    if (!dobValid)
      return setError('Date of birth must be in DD-MM-YYYY format.');
    if ((form.drivingLicense || form.passportFileNo) && !form.dob)
      return setError(
        'Date of birth is required when providing a Driving Licence or Passport.',
      );
    if (!dlValid) return setError('Driving licence number looks too short.');
    if (!voterValid)
      return setError('Voter ID must be in the format ABC1234567.');
    if (!passportFileValid)
      return setError('Passport file number looks too short.');
    if (!uanValid) return setError('UAN must be 12 digits.');
    setStep(3);
  }

  function goToCheckout() {
    saveDraft(form);
    router.push('/home/new/checkout');
  }

  const STEP_BY_ID: Record<string, 1 | 2 | 3> = {
    contact: 1,
    identity: 2,
    review: 3,
  };

  /* Clicking a step in the rail jumps back to an earlier, already-visited
   * step. Moving forward stays gated behind the Continue button's
   * validation, so we only honour backward navigation here. */
  function handleStepNavigate(id: string) {
    const target = STEP_BY_ID[id];
    if (target && target < step) {
      setError('');
      setStep(target);
    }
  }

  if (!user) return <div className="loading">Loading…</div>;

  const stepItems: StepperItem[] = [
    {
      id: 'contact',
      title: 'Basic Details',
      status: step === 1 ? 'ongoing' : 'completed',
    },
    {
      id: 'identity',
      title: 'Identity Documents',
      status: step === 1 ? 'not_started' : step === 2 ? 'ongoing' : 'completed',
    },
    {
      id: 'review',
      title: 'Review & Confirm',
      status: step === 3 ? 'ongoing' : 'not_started',
    },
  ];

  return (
    <AppShell nav={CLIENT_NAV} user={user} onLogout={handleLogout}>
      <div className="flex w-full flex-col gap-6 p-5 lg:p-8">
        {/* ── Header ── */}
        <div className="flex items-start gap-2">
          <Link
            href="/home"
            aria-label="Back to dashboard"
            className="group mt-1 inline-flex size-5 shrink-0 items-center justify-center text-primary"
          >
            <ArrowLeft className="size-5 transition-transform duration-300 ease-out group-hover:-translate-x-1" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-h4 font-semibold tracking-h3 text-text-heading md:text-h3">
              Fill Details Yourself
            </h1>
            <p className="mt-1 text-body-md text-text-subheading">
              Enter candidate details to start the background verification.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-0">
          {/* ── Stepper: desktop vertical rail (lg and up) ── */}
          <aside className="hidden shrink-0 self-start lg:sticky lg:top-6 lg:block lg:w-[200px]">
            <Stepper
              items={stepItems}
              orientation="vertical"
              connectorLength={28}
              onItemClick={handleStepNavigate}
            />
          </aside>

          {/* ── Compact step indicator below lg ── */}
          <div className="lg:hidden">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-body-md font-semibold text-text-heading">
                {stepItems[step - 1].title}
              </span>
              <span className="text-body-sm text-text-subheading">
                Step {step} of {stepItems.length}
              </span>
            </div>
            <ProgressBar value={(step / stepItems.length) * 100} />
          </div>

          <Divider
            orientation="Vertical"
            emphasis="Low"
            className="ml-9 mr-12 hidden !h-auto self-stretch lg:block"
          />

          {/* ── Active step form ── */}
          {/* Capped + left-aligned (not centred) so fields land at the same
              ~430px width as Recriauth instead of stretching edge-to-edge.
              `bgv-fill-form` bumps the label/field type a notch above the RDS
              12/14px defaults, scoped to this form only (see globals.css). */}
          <section className="bgv-fill-form min-w-0 max-w-4xl flex-1">

        {/* ─── STEP 1 : Contact ─── */}
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-h4 text-text-heading md:text-h4">
                Add a new candidate
              </h2>
              <p className="text-body-sm text-text-subheading">
                Capture contact details and accept the Terms &amp; Conditions
                before proceeding.
              </p>
            </div>

            <div className="grid gap-x-5 gap-y-5 md:grid-cols-2">
              <InputFieldWrapper label="Full name" required className="md:col-span-2">
                <Input
                  value={form.name}
                  placeholder="e.g. Sunita Kumari"
                  onChange={(event) => set('name', event.target.value)}
                />
              </InputFieldWrapper>

              <InputFieldWrapper label="Email" required error={emailError}>
                <Input
                  type="email"
                  value={form.email}
                  placeholder="their@email.com"
                  error={Boolean(emailError)}
                  onChange={(event) => set('email', event.target.value)}
                />
              </InputFieldWrapper>

              <InputFieldWrapper label="Phone" optional error={phoneError}>
                <PhoneInput
                  defaultCountry="IN"
                  value={form.phone}
                  error={Boolean(phoneError)}
                  onChange={(next) => set('phone', String(next ?? ''))}
                />
              </InputFieldWrapper>

              <InputFieldWrapper label="Role" optional>
                <SelectInput
                  value={form.role}
                  placeholder="Select a role"
                  options={ROLE_OPTIONS}
                  onChange={(next) => set('role', next)}
                />
              </InputFieldWrapper>
            </div>

            <Divider />

            <TermsBox agreed={tcAgreed} onAgreedChange={setTcAgreed} />

            {error && (
              <Callout
                state="Error"
                configuration="Text Only"
                title={error}
              />
            )}

            <Divider />

            <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex items-center gap-1.5 text-body-sm text-text-subheading">
                <Sparkles className="size-3.5" />
                Encrypted and stored securely.
              </div>
              <Button
                variant="primary"
                onClick={handleNextContact}
                disabled={!nameValid || !emailValid || !tcAgreed}
                rightIcon={<ArrowRight className="size-4" />}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* ─── STEP 2 : Identity ─── */}
        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-h4 text-text-heading md:text-h4">
                Identity documents
              </h2>
              <p className="text-body-sm text-text-subheading">
                All identity documents are required to run a complete background
                check.
              </p>
            </div>

            <div className="space-y-5">
              <h3 className="text-body-md font-semibold text-text-body">
                Core IDs
              </h3>
              <div className="grid gap-x-5 gap-y-5 md:grid-cols-2">
                <InputFieldWrapper
                  label="Aadhaar number"
                  required
                  error={aadhaarError}
                >
                  <Input
                    value={form.aadhaar}
                    placeholder="XXXX XXXX XXXX"
                    maxLength={14}
                    inputMode="numeric"
                    error={Boolean(aadhaarError)}
                    onChange={(event) =>
                      set('aadhaar', formatAadhaar(event.target.value))
                    }
                  />
                </InputFieldWrapper>

                <InputFieldWrapper label="PAN number" required error={panError}>
                  <Input
                    value={form.pan}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    error={Boolean(panError)}
                    onChange={(event) =>
                      set(
                        'pan',
                        event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                      )
                    }
                  />
                </InputFieldWrapper>
              </div>
            </div>

            <Divider />

            <div className="space-y-5">
              <div className="space-y-1">
                <h3 className="text-body-md font-semibold text-text-body">
                  Other IDs
                </h3>
                <p className="text-body-sm text-text-subheading">
                  Optional — fill what&apos;s available.
                </p>
              </div>

              <div className="grid gap-x-5 gap-y-5 md:grid-cols-2">
                <InputFieldWrapper
                  label="Date of birth"
                  note="Required for Driving Licence & Passport."
                  error={dobError}
                >
                  <DateInput
                    value={dobStringToDate(form.dob)}
                    placeholder="DD/MM/YYYY"
                    maxDate={new Date()}
                    error={Boolean(dobError)}
                    onChange={(date) => set('dob', dateToDobString(date))}
                  />
                </InputFieldWrapper>

                <InputFieldWrapper
                  label="Driving licence no."
                  optional
                  error={dlError}
                >
                  <Input
                    value={form.drivingLicense}
                    placeholder="e.g. MH0120201234567"
                    maxLength={20}
                    error={Boolean(dlError)}
                    onChange={(event) =>
                      set(
                        'drivingLicense',
                        event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                      )
                    }
                  />
                </InputFieldWrapper>

                <InputFieldWrapper label="Voter ID" optional error={voterError}>
                  <Input
                    value={form.voterId}
                    placeholder="e.g. ABC1234567"
                    maxLength={10}
                    error={Boolean(voterError)}
                    onChange={(event) =>
                      set(
                        'voterId',
                        event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                      )
                    }
                  />
                </InputFieldWrapper>

                <InputFieldWrapper
                  label="Passport file no."
                  optional
                  error={passportError}
                >
                  <Input
                    value={form.passportFileNo}
                    placeholder="e.g. AP1234567890"
                    maxLength={20}
                    error={Boolean(passportError)}
                    onChange={(event) =>
                      set(
                        'passportFileNo',
                        event.target.value.toUpperCase().replace(/[^A-Z0-9/]/g, ''),
                      )
                    }
                  />
                </InputFieldWrapper>

                <InputFieldWrapper label="UAN" optional error={uanError}>
                  <Input
                    value={form.uan}
                    placeholder="12-digit UAN"
                    maxLength={12}
                    inputMode="numeric"
                    error={Boolean(uanError)}
                    onChange={(event) =>
                      set('uan', formatUan(event.target.value))
                    }
                  />
                </InputFieldWrapper>
              </div>
            </div>

            {error && (
              <Callout state="Error" configuration="Text Only" title={error} />
            )}

            <Divider />

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => {
                  setError('');
                  setStep(1);
                }}
                leftIcon={<ArrowLeft className="size-4" />}
              >
                Back
              </Button>
              <Button
                variant="primary"
                className="w-full sm:w-auto"
                onClick={handleNextIdentity}
                disabled={
                  !aadhaarValid ||
                  !panValid ||
                  !dlValid ||
                  !voterValid ||
                  !passportFileValid ||
                  !uanValid
                }
                rightIcon={<ArrowRight className="size-4" />}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* ─── STEP 3 : Review & Pay ─── */}
        {step === 3 && (
          <div className="flex flex-col gap-6">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-h4 text-text-heading md:text-h4">
                Review &amp; continue
              </h2>
              <p className="text-body-sm text-text-subheading">
                Verify the details before proceeding to payment.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-body-md font-semibold text-text-body">
                Contact
              </h3>
              <div className="divide-y divide-border-default overflow-hidden rounded-lg border border-border-default">
                <SummaryRow label="Name" value={form.name} />
                <SummaryRow label="Email" value={form.email} />
                {form.phone && <SummaryRow label="Phone" value={form.phone} />}
                {form.role && <SummaryRow label="Role" value={form.role} />}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-body-md font-semibold text-text-body">
                Identity
              </h3>
              <div className="divide-y divide-border-default overflow-hidden rounded-lg border border-border-default">
                <SummaryRow
                  label="Aadhaar"
                  value={'XXXX XXXX ' + aadhaarDigits.slice(-4)}
                />
                <SummaryRow label="PAN" value={form.pan} />
                {form.dob && <SummaryRow label="Date of birth" value={form.dob} />}
                <SummaryRow
                  label="Driving licence"
                  value={form.drivingLicense}
                />
                <SummaryRow label="Voter ID" value={form.voterId} />
                {form.passportFileNo && (
                  <SummaryRow
                    label="Passport file no."
                    value={form.passportFileNo}
                  />
                )}
                <SummaryRow label="UAN" value={form.uan} />
              </div>
            </div>

            <Divider />

            <div className="flex items-start justify-between gap-4 rounded-lg bg-neutral-300 p-4">
              <div className="space-y-1">
                <div className="text-body-md font-semibold text-text-heading">
                  Verification fee
                </div>
                <div className="text-body-sm text-text-subheading">
                  {[
                    'PAN',
                    'Aadhaar (DigiLocker)',
                    form.drivingLicense ? 'Driving licence' : null,
                    form.voterId ? 'Voter ID' : null,
                    form.passportFileNo ? 'Passport' : null,
                    form.uan ? 'Employment history (UAN)' : null,
                    'Crime check',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <div className="shrink-0 text-h4 font-semibold text-text-heading">
                ₹{PRICE_INR}
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 text-body-sm text-text-subheading">
              <ShieldCheck className="size-3.5" />
              Secured by Razorpay
            </div>

            <Divider />

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => {
                  setError('');
                  setStep(2);
                }}
                leftIcon={<ArrowLeft className="size-4" />}
              >
                Edit details
              </Button>
              <Button
                variant="primary"
                className="w-full sm:w-auto"
                onClick={goToCheckout}
                rightIcon={<ArrowRight className="size-4" />}
              >
                Proceed to pay ₹{PRICE_INR}
              </Button>
            </div>
          </div>
        )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 bg-white px-4 py-3">
      <span className="text-body-sm text-text-subheading">{label}</span>
      <span className="text-body-sm font-medium text-text-body">
        {value || '—'}
      </span>
    </div>
  );
}
