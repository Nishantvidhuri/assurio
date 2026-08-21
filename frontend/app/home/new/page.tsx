'use client';
import PageLoader from '@/app/components/PageLoader';
import { BRAND } from '../../lib/brand';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  FileText,
  Loader2,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Tag,
  UploadCloud,
  Wallet,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  createOrder,
  createSubject,
  defaultPackage,
  deleteIdDocument,
  getWallet,
  validateDiscount,
  me,
  uploadIdDocument,
  type AuthUser,
} from '../../lib/api';
import { openRazorpayCheckout } from '../../lib/razorpay';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import { ONLINE_PAYMENT_ENABLED } from '../../lib/feature-flags';
import { CLIENT_NAV } from '../../components/Sidebar';
import AppShell from '../../components/AppShell';
import {
  clearDraft,
  saveDraft,
  type CandidateDraft,
  type IdDocument,
} from './draft';
import {
  createServerDraft,
  deleteServerDraft,
  fetchServerDraft,
  saveServerDraft,
} from './server-draft';
import {
  missingLabels,
  performableEta,
  splitChecks,
  type CheckFieldKey,
} from './checks';

const ACCEPTED_ID_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_ID_SIZE_BYTES = 10 * 1024 * 1024;
import {
  Button,
  Callout,
  Checkbox,
  DateInput,
  Divider,
  HoverTooltipAnchor,
  Input,
  InputFieldWrapper,
  PhoneInput,
  ProgressBar,
  SelectInput,
  Stepper,
  Textarea,
  validatePhoneNumber,
  type StepperItem,
} from '@/shared/components/ui';

// Fallback only — the real price comes from the DB default package.
const DEFAULT_PRICE_INR = 399;

// Which wizard step each candidate field lives on — lets a blocked check's
// "Add missing info" button jump straight to the step holding the empty field.
const FIELD_STEP: Record<CheckFieldKey, 1 | 2 | 3> = {
  name: 1,
  email: 1,
  phone: 1,
  role: 1,
  dob: 2,
  gender: 2,
  fatherName: 2,
  pincode: 2,
  permanentAddress: 2,
  aadhaar: 3,
  pan: 3,
  drivingLicense: 3,
  voterId: 3,
  passportFileNo: 3,
  uan: 3,
};

const PRESET_ROLES = [
  'Maid',
  'Driver',
  'Cook',
  'Worker',
  'PG Tenant',
  'Office Staff',
  'Nanny',
  'Security',
];

/** Sentinel value for the "Other" entry — never stored as the actual role. */
const ROLE_OTHER = '__other__';

const ROLE_OPTIONS = [
  ...PRESET_ROLES.map((role) => ({ label: role, value: role })),
  { label: 'Other (type your own)', value: ROLE_OTHER },
];

const GENDER_OPTIONS = ['Male', 'Female', 'Other'].map((g) => ({
  label: g,
  value: g,
}));

const EMPTY: CandidateDraft = {
  name: '',
  email: '',
  phone: '',
  role: '',
  gender: '',
  fatherName: '',
  permanentAddress: '',
  pincode: '',
  aadhaar: '',
  pan: '',
  dob: '',
  drivingLicense: '',
  voterId: '',
  passportFileNo: '',
  uan: '',
  idDocuments: [],
  consentAcceptedAt: '',
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

// A form with no meaningful input yet — used to defer creating a server draft
// until the user actually types something (no stray empty drafts).
function isDraftEmpty(f: CandidateDraft): boolean {
  const { idDocuments, ...rest } = f;
  return (
    (idDocuments?.length ?? 0) === 0 &&
    Object.values(rest).every((v) => !String(v ?? '').trim())
  );
}

export default function AddCandidatePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [form, setForm] = useState<CandidateDraft>(EMPTY);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [error, setError] = useState('');
  // Terms acceptance is recorded per-candidate (like Recriauth's consent): the
  // tick stamps a timestamp onto this candidate's draft, which becomes the
  // Subject's consentAcceptedAt at creation. Sticky within the form — once
  // accepted it can't be un-accepted, and it persists via the draft on resume.
  const tcAgreed = Boolean(form.consentAcceptedAt);
  // Gate server auto-save until the initial server draft has hydrated, so the
  // empty starting form never overwrites a previously-saved draft.
  const hydratedRef = useRef(false);
  const initRef = useRef(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  // When a blocked check's "Add missing info" is tapped, we jump to the field's
  // step and briefly highlight + focus the empty field.
  const [highlightField, setHighlightField] = useState<CheckFieldKey | null>(
    null,
  );
  // "Other" is a UI-only choice — the typed value is what lands in form.role.
  // Resuming a draft whose saved role isn't a preset re-opens the text field.
  const [roleIsCustom, setRoleIsCustom] = useState(false);

  // Bill amount is driven by the DB default package (admin Packages page).
  const [priceInr, setPriceInr] = useState<number>(DEFAULT_PRICE_INR);
  const [discountInput, setDiscountInput] = useState('');
  const [discountPct, setDiscountPct] = useState(0);
  const [appliedCode, setAppliedCode] = useState('');
  const [discountMsg, setDiscountMsg] = useState('');
  const [applyingDiscount, setApplyingDiscount] = useState(false);

  // Wallet: when the prepaid balance covers the price, the client can skip
  // Razorpay entirely and pay from balance (server recomputes the price).
  const [walletInr, setWalletInr] = useState<number | null>(null);
  const [payMethod, setPayMethod] = useState<'razorpay' | 'wallet'>(
    ONLINE_PAYMENT_ENABLED ? 'razorpay' : 'wallet',
  );

  const discountAmount = Math.round((priceInr * discountPct) / 100);
  const finalAmount = Math.max(0, priceInr - discountAmount);
  const walletCovers = walletInr !== null && walletInr >= finalAmount;
  /**
   * With online payment off the wallet is the only route, so an uncovered bill
   * simply cannot be paid here. Block it at the button and say why, rather
   * than letting the click through to a server error.
   */
  const walletShortfall =
    !ONLINE_PAYMENT_ENABLED && walletInr !== null && !walletCovers;
  const payBlockedReason = walletShortfall
    ? `Your wallet is short by ₹${Math.max(0, finalAmount - (walletInr ?? 0)).toLocaleString('en-IN')}. Contact us to top it up.`
    : !tcAgreed
      ? 'Accept the Terms & Conditions to continue.'
      : '';

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

  // Create (or resume) a server draft once we know the user. A fresh form mints
  // a new draft with its own id — it appears under "Your Candidates" as a Draft
  // and can be resumed via ?draftId=… after a refresh / on another device.
  useEffect(() => {
    if (!user || initRef.current) return;
    initRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const urlId = params.get('draftId');
    if (!urlId) {
      // Fresh form — defer creating a draft until the user types something, so
      // an abandoned-empty form never leaves a stray draft.
      hydratedRef.current = true;
      return;
    }
    // Reopen on the step the user was on when they refreshed / came back.
    const urlStep = Number(params.get('step'));
    if (urlStep >= 1 && urlStep <= 4) setStep(urlStep as 1 | 2 | 3 | 4);
    let cancelled = false;
    (async () => {
      try {
        const draft = await fetchServerDraft(urlId);
        if (cancelled) return;
        setDraftId(urlId);
        if (draft) {
          setForm({
            ...EMPTY,
            ...draft,
            idDocuments: Array.isArray(draft.idDocuments)
              ? draft.idDocuments
              : [],
          });
          // A saved role that isn't one of the presets was typed by hand —
          // reopen the text field so it stays editable on resume.
          const savedRole = (draft.role || '').trim();
          if (savedRole && !PRESET_ROLES.includes(savedRole)) {
            setRoleIsCustom(true);
          }
        }
      } catch {
        /* not found / offline — continue without server persistence */
      } finally {
        if (!cancelled) hydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Debounced auto-save. On the first meaningful change it lazily creates the
  // draft (id + URL); after that it just updates. Persisted server-side so the
  // form survives refresh/close.
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!draftId && isDraftEmpty(form)) return; // nothing worth persisting yet
    const timer = setTimeout(async () => {
      try {
        if (draftId) {
          await saveServerDraft(draftId, form);
        } else {
          const id = await createServerDraft(form);
          setDraftId(id);
          window.history.replaceState(null, '', `/home/new?draftId=${id}`);
        }
      } catch {
        /* best-effort — keep editing even if a save fails */
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [form, draftId]);

  // Keep the current step in the URL so a refresh reopens on it (not step 1).
  useEffect(() => {
    if (!draftId) return;
    window.history.replaceState(
      null,
      '',
      `/home/new?draftId=${draftId}&step=${step}`,
    );
  }, [draftId, step]);

  // Jump to the step holding a blocked check's first missing field, and flag it
  // for highlight/focus.
  function goToMissingInfo(missing: CheckFieldKey[]) {
    setError('');
    const first = missing[0];
    if (!first) return;
    setStep(FIELD_STEP[first] ?? 2);
    setHighlightField(first);
  }

  // After the step renders, scroll the highlighted field into view + focus it,
  // then clear the highlight so it fades.
  useEffect(() => {
    if (!highlightField) return;
    const el = document.getElementById(`field-${highlightField}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = el.querySelector<HTMLElement>(
        'input, textarea, [role="combobox"], button',
      );
      focusable?.focus();
    }
    const t = setTimeout(() => setHighlightField(null), 500);
    return () => clearTimeout(t);
  }, [highlightField, step]);

  // Brief light-red background flash on the INPUT BOX (not its label) that a
  // blocked check pointed us to. Applied to the control's className so only the
  // field itself tints. `!bg-surface-error` beats the box's default bg.
  const fieldHighlight = (key: CheckFieldKey) =>
    highlightField === key
      ? 'bg-surface-error! transition-colors duration-300'
      : 'transition-colors duration-300';

  function handleLogout() {
    doLogout(router);
  }

  function set<K extends keyof CandidateDraft>(
    key: K,
    value: CandidateDraft[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /* ── ID document upload (virus-scanned server-side, stored in S3) ── */
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const idDocuments = form.idDocuments ?? [];

  async function handleIdFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError('');
    for (const file of Array.from(files)) {
      if (!ACCEPTED_ID_TYPES.includes(file.type)) {
        setUploadError(`${file.name}: only PDF, JPG, or PNG files are allowed.`);
        continue;
      }
      if (file.size > MAX_ID_SIZE_BYTES) {
        setUploadError(`${file.name}: file must be 10MB or smaller.`);
        continue;
      }
      setUploading(true);
      try {
        const uploaded = await uploadIdDocument(file);
        setForm((f) => ({
          ...f,
          idDocuments: [...(f.idDocuments ?? []), uploaded],
        }));
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : `Could not upload ${file.name}.`,
        );
      } finally {
        setUploading(false);
      }
    }
  }

  function removeIdDocument(key: string) {
    setForm((f) => ({
      ...f,
      idDocuments: (f.idDocuments ?? []).filter((doc) => doc.key !== key),
    }));
    // Immediately delete the object from S3 so removing/replacing a document
    // doesn't leave an orphan behind. Best-effort — the UI already dropped it.
    void deleteIdDocument(key).catch(() => {
      /* ignore — the reference is gone from the form regardless */
    });
  }

  /* ── per-field validation ── */
  const nameValid = form.name.trim().length >= 2;
  // Email is optional — valid when empty, or when it matches the pattern.
  const emailValid =
    form.email.trim() === '' ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const phoneValid =
    form.phone === '' || form.phone.replace(/\D/g, '').length >= 10;

  const aadhaarDigits = form.aadhaar.replace(/\s/g, '');
  // Aadhaar & PAN are optional — empty is valid; only malformed content fails.
  const aadhaarValid = form.aadhaar === '' || /^\d{12}$/.test(aadhaarDigits);
  const panValid = form.pan === '' || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan);
  const dobValid = form.dob === '' || /^\d{2}-\d{2}-\d{4}$/.test(form.dob);
  const dlValid = form.drivingLicense === '' || form.drivingLicense.length >= 5;
  const voterValid = form.voterId === '' || /^[A-Z]{3}\d{7}$/.test(form.voterId);
  const passportFileValid =
    form.passportFileNo === '' || form.passportFileNo.length >= 5;
  const uanValid = form.uan === '' || /^\d{12}$/.test(form.uan);
  const pincodeValid = form.pincode === '' || /^\d{6}$/.test(form.pincode);

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
  const pincodeError =
    form.pincode.length > 0 && !pincodeValid
      ? 'Pincode must be 6 digits.'
      : undefined;

  /* ── step 1 → 2 ── */
  function handleNextContact() {
    setError('');
    if (!nameValid) return setError("Please enter the candidate's name.");
    if (!emailValid) return setError('Please enter a valid email.');
    if (!phoneValid) return setError('Phone number looks too short.');
    setStep(2);
  }

  /* ── step 2 → 3 ── */
  function handleNextAdditional() {
    setError('');
    if (!dobValid)
      return setError('Date of birth must be in DD-MM-YYYY format.');
    if (!pincodeValid) return setError('Pincode must be 6 digits.');
    setStep(3);
  }

  /* ── step 3 → 4 ── */
  function handleNextIdentity() {
    setError('');
    if (!aadhaarValid) return setError('Aadhaar must be 12 digits.');
    if (!panValid) return setError('PAN must match the format ABCDE1234F.');
    if ((form.drivingLicense || form.passportFileNo) && !form.dob)
      return setError(
        'Date of birth is required when providing a Driving Licence or Passport. Add it under Additional Details.',
      );
    if (!dlValid) return setError('Driving licence number looks too short.');
    if (!voterValid)
      return setError('Voter ID must be in the format ABC1234567.');
    if (!passportFileValid)
      return setError('Passport file number looks too short.');
    if (!uanValid) return setError('UAN must be 12 digits.');
    setStep(4);
  }

  // Load the current bill amount from the DB default package on mount.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    defaultPackage(token)
      .then((p) => {
        if (p && typeof p.priceInr === 'number') setPriceInr(p.priceInr);
      })
      .catch(() => {
        /* keep fallback price */
      });
    getWallet(token)
      .then((w) => setWalletInr(w.balanceInr))
      .catch(() => {
        /* wallet unavailable — Razorpay path still works */
      });
  }, []);

  // If the balance stops covering the bill (e.g. discount removed), fall back
  // to Razorpay — but only when it is actually on offer. With online payment
  // off there is nothing to fall back to: the button stays disabled and says
  // why, rather than switching to a method that cannot complete.
  useEffect(() => {
    if (ONLINE_PAYMENT_ENABLED && !walletCovers && payMethod === 'wallet') {
      setPayMethod('razorpay');
    }
  }, [walletCovers, payMethod]);

  async function applyDiscount() {
    const token = getToken();
    if (!token) return;
    const code = discountInput.trim();
    if (!code) return;
    setApplyingDiscount(true);
    setDiscountMsg('');
    try {
      const res = await validateDiscount(token, code);
      if (res.valid && res.percentOff > 0) {
        setDiscountPct(res.percentOff);
        setAppliedCode(res.code);
        setDiscountMsg(`Code ${res.code} applied — ${res.percentOff}% off`);
      } else {
        setDiscountPct(0);
        setAppliedCode('');
        setDiscountMsg('That code is invalid or expired.');
      }
    } catch {
      setDiscountMsg('Could not validate the code. Please try again.');
    } finally {
      setApplyingDiscount(false);
    }
  }

  function clearDiscount() {
    setDiscountPct(0);
    setAppliedCode('');
    setDiscountInput('');
    setDiscountMsg('');
  }

  async function payNow() {
    setError('');
    if (!tcAgreed) {
      setError('Please accept the Terms & Conditions to continue.');
      return;
    }
    setPaying(true);
    try {
      const token = getToken();
      if (!token) throw new Error('Session expired');

      // Wallet path: no Razorpay round-trip — the server debits the balance
      // and creates the candidate in one transaction, then we land on the
      // success page with the created record.
      if (payMethod === 'wallet' && walletCovers) {
        const subject = await createSubject(token, {
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          role: form.role.trim() || undefined,
          panNumber: form.pan.trim() || undefined,
          aadhaarNumber: form.aadhaar.replace(/\s/g, '').trim() || undefined,
          dob: form.dob.trim() || undefined,
          fatherName: form.fatherName.trim() || undefined,
          permanentAddress: form.permanentAddress.trim() || undefined,
          pincode: form.pincode.trim() || undefined,
          drivingLicense: form.drivingLicense.trim() || undefined,
          voterId: form.voterId.trim() || undefined,
          passportFileNo: form.passportFileNo.trim() || undefined,
          uan: form.uan.trim() || undefined,
          consentAcceptedAt: form.consentAcceptedAt || undefined,
          payment: {
            method: 'wallet',
            discountCode: appliedCode || undefined,
          },
        });
        sessionStorage.setItem('recrify:created', JSON.stringify(subject));
        clearDraft();
        if (draftId) void deleteServerDraft(draftId);
        sessionStorage.removeItem('recrify:draft-id');
        router.push('/home/new/success?wallet=1');
        return;
      }

      // Persist the draft so the success page can create the candidate + clean
      // up this draft once payment is confirmed.
      saveDraft(form);
      if (draftId) sessionStorage.setItem('recrify:draft-id', draftId);

      const aadhaarDigits = form.aadhaar.replace(/\s/g, '');
      const order = await createOrder(token, {
        amount: finalAmount,
        description: `Recrify verification · ${form.name}`,
        customer: {
          name: form.name,
          email: form.email || undefined,
          contact: form.phone || undefined,
        },
        notes: {
          pan: form.pan,
          aadhaar_masked: 'XXXX XXXX ' + aadhaarDigits.slice(-4),
          flow: 'client-add-candidate',
          price: String(priceInr),
          discount_code: appliedCode || 'none',
          discount_pct: String(discountPct),
        },
      });
      if (!order.keyId) {
        throw new Error('Payments are not configured. Please contact support.');
      }

      // Razorpay opens as an overlay on this page — no redirect.
      let response;
      try {
        response = await openRazorpayCheckout({
          key: order.keyId,
          orderId: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: 'Recrify',
          description: `Verification · ${form.name}`,
          prefill: {
            name: form.name,
            email: form.email || undefined,
            contact: form.phone || undefined,
          },
          themeColor: BRAND.ink,
        });
      } catch {
        // Modal dismissed — stay on the review step so they can retry.
        setPaying(false);
        return;
      }

      if (!response.razorpay_order_id || !response.razorpay_signature) {
        throw new Error('Payment could not be confirmed. Please try again.');
      }

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
      setPaying(false);
    }
  }

  const STEP_BY_ID: Record<string, 1 | 2 | 3 | 4> = {
    contact: 1,
    additional: 2,
    identity: 3,
    review: 4,
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

  if (!user) return <PageLoader />;

  const { performable, blocked } = splitChecks(form);

  const stepItems: StepperItem[] = [
    {
      id: 'contact',
      title: 'Basic Details',
      status: step === 1 ? 'ongoing' : 'completed',
    },
    {
      id: 'additional',
      title: 'Additional Details',
      status: step < 2 ? 'not_started' : step === 2 ? 'ongoing' : 'completed',
    },
    {
      id: 'identity',
      title: 'Identity Documents',
      status: step < 3 ? 'not_started' : step === 3 ? 'ongoing' : 'completed',
    },
    {
      id: 'review',
      title: 'Review & Confirm',
      status: step === 4 ? 'ongoing' : 'not_started',
    },
  ];

  return (
    <AppShell
      nav={CLIENT_NAV}
      user={user}
      onLogout={handleLogout}
      hideMobileTopBar
    >
      <div className="flex w-full min-w-0 flex-col gap-6 overflow-x-clip">
        {/* ── Header (desktop only — redundant on mobile since the user is
            filling the form themselves; mobile shows back + progress instead) ── */}
        <div className="hidden items-start gap-2 lg:flex">
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

          {/* ── Compact step indicator below lg — back button + progress ── */}
          <div className="flex items-center gap-3 lg:hidden">
            <button
              type="button"
              aria-label={step > 1 ? 'Previous step' : 'Back to dashboard'}
              onClick={() => {
                setError('');
                if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3 | 4);
                else router.push('/home');
              }}
              className="group inline-flex size-5 shrink-0 items-center justify-center text-primary"
            >
              <ArrowLeft className="size-5 transition-transform duration-300 ease-out group-hover:-translate-x-1" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-body-md font-semibold text-text-heading">
                  {stepItems[step - 1].title}
                </span>
                <span className="text-body-sm text-text-subheading">
                  Step {step} of {stepItems.length}
                </span>
              </div>
              <ProgressBar value={(step / stepItems.length) * 100} />
            </div>
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
          <section className="bgv-fill-form min-w-0 max-w-4xl flex-1 pb-24 lg:pb-0">

        {/* Consent-first reminder — shown on every step of the form. */}
        <div className="mb-5">
          <Callout
            state="Info"
            configuration="Text & Subtext"
            title="Consent-based verification"
            subtext="All checks start only after the candidate accepts the consent agreement. If they decline or don't respond, the full amount is refunded to your wallet."
            showAction={false}
            showCloseIcon={false}
            multiline
          />
        </div>

        {/* ─── STEP 1 : Contact ─── */}
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-h4 text-text-heading md:text-h4">
                Add a new candidate
              </h2>
              <p className="text-body-sm text-text-subheading">
                Capture the candidate&apos;s contact details to get started.
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

              <InputFieldWrapper label="Email" optional error={emailError}>
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
                  value={roleIsCustom ? ROLE_OTHER : form.role}
                  placeholder="Select a role"
                  options={ROLE_OPTIONS}
                  onChange={(next) => {
                    if (next === ROLE_OTHER) {
                      setRoleIsCustom(true);
                      set('role', '');
                    } else {
                      setRoleIsCustom(false);
                      set('role', next);
                    }
                  }}
                />
                {roleIsCustom && (
                  <div className="mt-2">
                    <Input
                      autoFocus
                      value={form.role}
                      placeholder="Enter the role (e.g. Gardener)"
                      maxLength={40}
                      onChange={(event) => set('role', event.target.value)}
                    />
                  </div>
                )}
              </InputFieldWrapper>

              <InputFieldWrapper
                label="Upload IDs"
                optional
                className="md:col-span-2"
              >
                <div className="flex flex-col gap-3">
                  <label
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border-default bg-surface-nav px-4 py-6 text-center transition-colors hover:border-border-focused ${
                      uploading
                        ? 'pointer-events-none opacity-60'
                        : 'cursor-pointer'
                    }`}
                  >
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      multiple
                      className="hidden"
                      disabled={uploading}
                      onChange={(event) => {
                        void handleIdFiles(event.target.files);
                        event.target.value = '';
                      }}
                    />
                    <span className="inline-flex items-center gap-1.5 text-body-md font-medium text-text-link">
                      {uploading ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Scanning &amp; uploading…
                        </>
                      ) : (
                        <>
                          Browse
                          <UploadCloud className="size-4" />
                        </>
                      )}
                    </span>
                    <span className="text-body-sm text-text-subheading">
                      JPG, PNG, or PDF up to 10MB
                    </span>
                  </label>

                  <p className="text-body-sm text-text-subheading">
                    Upload at least one valid ID from Aadhaar, PAN, Voter ID, or
                    Driving Licence. Every file is virus-scanned before it is
                    stored.
                  </p>

                  {idDocuments.length > 0 && (
                    <ul className="flex flex-col gap-2">
                      {idDocuments.map((doc: IdDocument) => (
                        <li
                          key={doc.key}
                          className="flex items-center gap-3 rounded-lg border border-border-default bg-surface-page px-3 py-2"
                        >
                          <FileText className="size-4 shrink-0 text-text-link" />
                          <span className="min-w-0 flex-1 truncate text-body-sm text-text-heading">
                            {doc.name}
                          </span>
                          <span className="shrink-0 text-body-sm text-text-subheading">
                            {(doc.size / 1024 / 1024).toFixed(1)} MB
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove ${doc.name}`}
                            className="shrink-0 rounded p-1 text-text-subheading transition-colors hover:text-text-error"
                            onClick={() => removeIdDocument(doc.key)}
                          >
                            <X className="size-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {uploadError && (
                    <Callout
                      state="Error"
                      configuration="Text Only"
                      title={uploadError}
                    />
                  )}
                </div>
              </InputFieldWrapper>
            </div>

            {error && (
              <Callout
                state="Error"
                configuration="Text Only"
                title={error}
              />
            )}

            <Divider />

            <div className="hidden flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between lg:flex">
              <div className="inline-flex items-center gap-1.5 text-body-sm text-text-subheading">
                <Sparkles className="size-3.5" />
                Encrypted and stored securely.
              </div>
              <Button
                variant="primary"
                onClick={handleNextContact}
                disabled={!nameValid || !emailValid}
                rightIcon={<ArrowRight className="size-4" />}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* ─── STEP 2 : Additional Details ─── */}
        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-h4 text-text-heading md:text-h4">
                Additional details
              </h2>
              <p className="text-body-sm text-text-subheading">
                Enter additional details of the person you want to verify.
              </p>
            </div>

            <div className="grid gap-x-5 gap-y-5 md:grid-cols-2">
              <InputFieldWrapper
                id="field-dob"
                label="Date of birth"
                optional
                error={dobError}
              >
                <DateInput
                  className={fieldHighlight('dob')}
                  value={dobStringToDate(form.dob)}
                  placeholder="DD/MM/YYYY"
                  maxDate={new Date()}
                  error={Boolean(dobError)}
                  onChange={(date) => set('dob', dateToDobString(date))}
                />
              </InputFieldWrapper>

              <InputFieldWrapper label="Gender" optional>
                <SelectInput
                  value={form.gender}
                  placeholder="Select candidate's gender"
                  options={GENDER_OPTIONS}
                  onChange={(next) => set('gender', next)}
                />
              </InputFieldWrapper>

              <InputFieldWrapper label="Father's name" optional>
                <Input
                  value={form.fatherName}
                  placeholder="e.g. Ramesh Kumar"
                  onChange={(event) => set('fatherName', event.target.value)}
                />
              </InputFieldWrapper>

              <InputFieldWrapper label="Pincode" optional error={pincodeError}>
                <Input
                  value={form.pincode}
                  placeholder="6-digit pincode"
                  maxLength={6}
                  inputMode="numeric"
                  error={Boolean(pincodeError)}
                  onChange={(event) =>
                    set(
                      'pincode',
                      event.target.value.replace(/\D/g, '').slice(0, 6),
                    )
                  }
                />
              </InputFieldWrapper>

              <InputFieldWrapper
                id="field-permanentAddress"
                label="Permanent address"
                optional
                className="md:col-span-2"
              >
                <Textarea
                  className={fieldHighlight('permanentAddress')}
                  value={form.permanentAddress}
                  rows={3}
                  placeholder="House / street, area, city, state, PIN"
                  onChange={(event) =>
                    set('permanentAddress', event.target.value)
                  }
                />
              </InputFieldWrapper>
            </div>

            {error && (
              <Callout state="Error" configuration="Text Only" title={error} />
            )}

            <Divider />

            <div className="hidden flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between lg:flex">
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
                onClick={handleNextAdditional}
                disabled={!dobValid || !pincodeValid}
                rightIcon={<ArrowRight className="size-4" />}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* ─── STEP 3 : Identity ─── */}
        {step === 3 && (
          <div className="flex flex-col gap-6">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-h4 text-text-heading md:text-h4">
                Identity documents
              </h2>
              <p className="text-body-sm text-text-subheading">
                Add any identity documents you have — the more you provide, the
                more complete the background check.
              </p>
            </div>

            <div className="space-y-5">
              <InputFieldWrapper
                id="field-aadhaar"
                label="Aadhaar number"
                error={aadhaarError}
              >
                <Input
                  className={fieldHighlight('aadhaar')}
                  value={form.aadhaar}
                  placeholder="XXXX XXXX XXXX"
                  maxLength={14}
                  inputMode="numeric"
                  error={Boolean(aadhaarError)}
                  onChange={(event) =>
                    set('aadhaar', formatAadhaar(event.target.value))
                  }
                />
                <p className="mt-1.5 flex items-start gap-1.5 text-body-sm text-text-subheading">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                  Only the candidate can verify their Aadhaar. After payment,
                  we&apos;ll email them a secure DigiLocker link.
                </p>
              </InputFieldWrapper>

              <InputFieldWrapper
                id="field-pan"
                label="PAN number"
                error={panError}
              >
                <Input
                  className={fieldHighlight('pan')}
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

              <InputFieldWrapper
                id="field-drivingLicense"
                label="Driving licence no."
                optional
                error={dlError}
              >
                <Input
                  className={fieldHighlight('drivingLicense')}
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

              <InputFieldWrapper
                id="field-voterId"
                label="Voter ID"
                optional
                error={voterError}
              >
                <Input
                  className={fieldHighlight('voterId')}
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
                id="field-passportFileNo"
                label="Passport file no."
                optional
                error={passportError}
              >
                <Input
                  className={fieldHighlight('passportFileNo')}
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

              <InputFieldWrapper
                id="field-uan"
                label="UAN"
                optional
                error={uanError}
              >
                <Input
                  className={fieldHighlight('uan')}
                  value={form.uan}
                  placeholder="12-digit UAN"
                  maxLength={12}
                  inputMode="numeric"
                  error={Boolean(uanError)}
                  onChange={(event) => set('uan', formatUan(event.target.value))}
                />
              </InputFieldWrapper>
            </div>

            {error && (
              <Callout state="Error" configuration="Text Only" title={error} />
            )}

            <Divider />

            <div className="hidden flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between lg:flex">
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => {
                  setError('');
                  setStep(2);
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

        {/* ─── STEP 4 : Review & Pay ─── */}
        {step === 4 && (
          <div className="flex flex-col gap-6">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-h4 text-text-heading md:text-h4">
                Review &amp; continue
              </h2>
              <p className="text-body-sm text-text-subheading">
                Verify the details before proceeding to payment.
              </p>
            </div>

            <CollapsibleSection title="Contact">
              <div className="divide-y divide-border-default overflow-hidden rounded-lg border border-border-default">
                <SummaryRow label="Name" value={form.name} />
                {form.email && <SummaryRow label="Email" value={form.email} />}
                {form.phone && <SummaryRow label="Phone" value={form.phone} />}
                {form.role && <SummaryRow label="Role" value={form.role} />}
              </div>
            </CollapsibleSection>

            {(form.dob ||
              form.gender ||
              form.fatherName ||
              form.permanentAddress ||
              form.pincode) && (
              <CollapsibleSection title="Additional details">
                <div className="divide-y divide-border-default overflow-hidden rounded-lg border border-border-default">
                  {form.dob && (
                    <SummaryRow label="Date of birth" value={form.dob} />
                  )}
                  {form.gender && (
                    <SummaryRow label="Gender" value={form.gender} />
                  )}
                  {form.fatherName && (
                    <SummaryRow label="Father's name" value={form.fatherName} />
                  )}
                  {form.permanentAddress && (
                    <SummaryRow
                      label="Permanent address"
                      value={form.permanentAddress}
                    />
                  )}
                  {form.pincode && (
                    <SummaryRow label="Pincode" value={form.pincode} />
                  )}
                </div>
              </CollapsibleSection>
            )}

            <CollapsibleSection title="Identity">
              <div className="divide-y divide-border-default overflow-hidden rounded-lg border border-border-default">
                <SummaryRow
                  label="Aadhaar"
                  value={'XXXX XXXX ' + aadhaarDigits.slice(-4)}
                />
                <SummaryRow label="PAN" value={form.pan} />
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
            </CollapsibleSection>

            <Divider />

            {/* What we can / can't verify with the details provided so far */}
            <div className="space-y-5">
              {performable.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-body-md font-semibold text-text-body">
                    Checks we&apos;ll perform
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {performable.map((c, i) => {
                      const eta = performableEta(c);
                      return (
                        <RevealBox
                          key={c.id}
                          index={i}
                          className="flex items-center gap-2.5 rounded-lg border border-border-success bg-surface-success px-3.5 py-3"
                        >
                          <CheckCircle2 className="size-4 shrink-0 text-icon-success" />
                          <span className="flex-1 text-body-sm font-medium text-text-heading">
                            {c.label}
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 text-body-sm text-text-subheading">
                            {eta === 'Instant on consent' ? (
                              <Zap className="size-3" />
                            ) : (
                              <Clock className="size-3" />
                            )}
                            {eta}
                          </span>
                        </RevealBox>
                      );
                    })}
                  </div>
                </div>
              )}

              {blocked.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-body-md font-semibold text-text-body">
                    Checks we can&apos;t perform yet
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {blocked.map((c, i) => (
                      <RevealBox
                        key={c.id}
                        index={i}
                        className="flex items-start gap-2.5 rounded-lg border border-border-warning bg-surface-warning px-3.5 py-3"
                      >
                        <XCircle className="mt-0.5 size-4 shrink-0 text-text-warning" />
                        <div className="min-w-0 flex-1">
                          <div className="text-body-sm font-medium text-text-heading">
                            {c.label}
                          </div>
                          <div className="flex items-center justify-between gap-x-2">
                            <span className="min-w-0 flex-1 text-body-sm text-warning-900">
                              Needs {missingLabels(c.missing)}
                            </span>
                            <button
                              type="button"
                              onClick={() => goToMissingInfo(c.missing)}
                              className="inline-flex shrink-0 items-center gap-0.5 text-body-sm font-medium text-text-link hover:underline"
                            >
                              Add missing info
                              <ArrowRight className="size-3" />
                            </button>
                          </div>
                        </div>
                      </RevealBox>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Divider />

            {/* Discount code — validated against the DB discount codes. */}
            <div className="rounded-lg border border-border-default bg-white p-4">
              <div className="mb-2 text-body-md font-semibold text-text-heading">
                Get additional discount
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    value={discountInput}
                    placeholder="Enter discount code"
                    disabled={!!appliedCode}
                    onChange={(e) =>
                      setDiscountInput(e.target.value.toUpperCase())
                    }
                  />
                </div>
                {appliedCode ? (
                  <Button variant="secondary" onClick={clearDiscount}>
                    Remove
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={applyDiscount}
                    disabled={applyingDiscount || !discountInput.trim()}
                  >
                    {applyingDiscount ? 'Applying…' : 'Apply'}
                  </Button>
                )}
              </div>
              {discountMsg && (
                <p
                  className={`mt-2 text-body-sm ${
                    discountPct > 0 ? 'text-success' : 'text-text-error'
                  }`}
                >
                  {discountMsg}
                </p>
              )}
            </div>

            {/* Payment summary — price and total come from the DB package. */}
            <div className="overflow-hidden rounded-xl border border-border-default bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-border-default bg-neutral-50 px-4 py-3">
                <ReceiptText className="size-4 text-icon-default" />
                <span className="text-body-md font-semibold text-text-heading">
                  Payment summary
                </span>
              </div>

              <div className="space-y-3 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-body-md text-text-body">
                      Verification fee
                    </div>
                    <div className="mt-0.5 text-body-sm text-text-subheading">
                      {performable.length} check
                      {performable.length === 1 ? '' : 's'} included
                    </div>
                  </div>
                  <div className="shrink-0 text-body-md tabular-nums text-text-body">
                    ₹{priceInr.toLocaleString('en-IN')}
                  </div>
                </div>

                {discountPct > 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-success px-2.5 py-1 text-body-sm font-medium text-success">
                      <Tag className="size-3.5" />
                      {appliedCode} · {discountPct}% off
                    </span>
                    <span className="shrink-0 text-body-md tabular-nums text-success">
                      −₹{discountAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-end justify-between gap-4 border-t border-border-default bg-neutral-50 px-4 py-4">
                <div>
                  <div className="text-body-md font-semibold text-text-heading">
                    Total payable
                  </div>
                  <div className="mt-0.5 text-body-sm text-text-subheading">
                    Inclusive of all taxes
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {discountPct > 0 && (
                    <div className="text-body-sm tabular-nums text-text-placeholder line-through">
                      ₹{priceInr.toLocaleString('en-IN')}
                    </div>
                  )}
                  <div className="text-h3 font-bold leading-tight tabular-nums text-text-heading">
                    ₹{finalAmount.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {discountPct > 0 && (
                <div className="flex items-center justify-center gap-1.5 border-t border-border-success bg-surface-success px-4 py-2 text-body-sm font-medium text-success">
                  <Sparkles className="size-3.5" />
                  You saved ₹{discountAmount.toLocaleString('en-IN')} on this
                  verification
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border-default bg-white p-4">
              <p className="mb-3 text-body-sm text-text-body">
                By checking the box below, you agree to our{' '}
                <a
                  href="/legal/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-text-link underline underline-offset-2 hover:text-text-link-hover"
                >
                  Terms &amp; Conditions
                </a>{' '}
                and confirm you have obtained the candidate&apos;s consent.
              </p>
              <label className="flex w-fit cursor-pointer items-center gap-2 select-none">
                <Checkbox
                  size="Small"
                  checked={tcAgreed}
                  onChange={(event) => {
                    // Toggle: stamp consent time when accepted, clear when unticked.
                    set(
                      'consentAcceptedAt',
                      event.currentTarget.checked
                        ? new Date().toISOString()
                        : '',
                    );
                  }}
                />
                <span className="text-body-md text-text-body">
                  I accept the Terms &amp; Conditions
                  <span className="text-text-error"> *</span>
                </span>
              </label>
            </div>

            {/* Payment. With online payment off, the wallet is the only route:
                show the balance and the shortfall rather than a choice of one.
                The Razorpay tile returns automatically when the flag is on. */}
            {!ONLINE_PAYMENT_ENABLED ? (
              <div
                className={`rounded-lg border p-4 ${
                  walletCovers
                    ? 'border-border-default bg-white'
                    : 'border-border-warning bg-surface-warning'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${
                      walletCovers
                        ? 'bg-primary text-white'
                        : 'bg-white text-warning'
                    }`}
                  >
                    <Wallet className="size-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-body-md font-medium text-text-heading">
                      Paying from wallet
                    </div>
                    <div className="mt-0.5 text-body-sm text-text-subheading">
                      Balance ₹{(walletInr ?? 0).toLocaleString('en-IN')} ·
                      this check costs ₹{finalAmount.toLocaleString('en-IN')}
                    </div>
                    {walletCovers ? (
                      <div className="mt-1 text-body-sm text-text-placeholder">
                        Refunded automatically if the candidate declines consent
                      </div>
                    ) : (
                      <div className="mt-1 text-body-sm text-warning-900">
                        Short by ₹
                        {Math.max(
                          0,
                          finalAmount - (walletInr ?? 0),
                        ).toLocaleString('en-IN')}
                        . Contact us to top up your wallet, then come back to
                        this page.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : walletCovers ? (
              <fieldset className="rounded-lg border border-border-default bg-white p-4">
                <legend className="px-1 text-body-md font-medium text-text-heading">
                  Pay using
                </legend>
                {/* Two selectable tiles rather than bare radios: the choice
                    carries real consequences (wallet is refundable if consent
                    is declined, a card payment is not), so each option states
                    its own terms instead of relying on a footnote that changes
                    under the selection. */}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      value: 'wallet' as const,
                      icon: <Wallet className="size-[18px]" />,
                      title: 'Wallet balance',
                      meta: `₹${(walletInr ?? 0).toLocaleString('en-IN')} available`,
                      note: 'Refunded automatically if consent is declined',
                    },
                    {
                      value: 'razorpay' as const,
                      icon: <CreditCard className="size-[18px]" />,
                      title: 'Card / UPI',
                      meta: 'via Razorpay',
                      note: 'Secure checkout opens in a popup',
                    },
                  ].map((opt) => {
                    const selected = payMethod === opt.value;
                    return (
                      <label
                        key={opt.value}
                        className={`relative flex cursor-pointer gap-3 rounded-lg border p-3.5 transition-colors select-none ${
                          selected
                            ? 'border-primary bg-primary-bg ring-1 ring-primary'
                            : 'border-border-default bg-white hover:border-neutral-500 hover:bg-neutral-100'
                        }`}
                      >
                        <input
                          type="radio"
                          name="pay-method"
                          checked={selected}
                          onChange={() => setPayMethod(opt.value)}
                          /* Visually hidden, not removed — the label stays
                             clickable, arrow keys still move between options
                             and screen readers still announce a radio group. */
                          className="sr-only"
                        />
                        <span
                          className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${
                            selected
                              ? 'bg-primary text-white'
                              : 'bg-neutral-200 text-text-subheading'
                          }`}
                        >
                          {opt.icon}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="text-body-md font-medium text-text-heading">
                              {opt.title}
                            </span>
                            {selected && (
                              <CheckCircle2 className="size-4 shrink-0 text-primary" />
                            )}
                          </span>
                          <span className="mt-0.5 block text-body-sm text-text-subheading">
                            {opt.meta}
                          </span>
                          <span className="mt-1 block text-body-sm text-text-placeholder">
                            {opt.note}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            {/* Only when there is no choice to make — with the tiles on screen
                each option already states its own terms, and repeating them
                here just says the same thing twice. */}
            {!walletCovers && (
              <div className="inline-flex items-center gap-1.5 text-body-sm text-text-subheading">
                <ShieldCheck className="size-3.5" />
                Secured by Razorpay
              </div>
            )}

            <Divider />

            <div className="hidden flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between lg:flex">
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => {
                  setError('');
                  setStep(3);
                }}
                leftIcon={<ArrowLeft className="size-4" />}
              >
                Edit details
              </Button>
              <HoverTooltipAnchor
                text={payBlockedReason}
                position="top-right"
                className={payBlockedReason ? '' : 'pointer-events-none'}
              >
                <Button
                  variant="primary"
                  className="w-full sm:w-auto"
                  onClick={payNow}
                  disabled={paying || !tcAgreed || walletShortfall}
                  rightIcon={<ArrowRight className="size-4" />}
                >
                  {paying ? (payMethod === 'wallet' ? 'Processing…' : 'Opening secure checkout…') : payMethod === 'wallet' ? `Pay ₹${finalAmount} from wallet` : `Proceed to pay ₹${finalAmount}`}
                </Button>
              </HoverTooltipAnchor>
            </div>
          </div>
        )}
          </section>
        </div>

        {/* Mobile sticky action — primary step button, always visible like the
            reference's fixed "Next" so the form reads as one contained page. */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:hidden">
          {step === 1 && (
            <Button
              variant="primary"
              className="w-full"
              onClick={handleNextContact}
              disabled={!nameValid || !emailValid}
              rightIcon={<ArrowRight className="size-4" />}
            >
              Continue
            </Button>
          )}
          {step === 2 && (
            <Button
              variant="primary"
              className="w-full"
              onClick={handleNextAdditional}
              disabled={!dobValid || !pincodeValid}
              rightIcon={<ArrowRight className="size-4" />}
            >
              Continue
            </Button>
          )}
          {step === 3 && (
            <Button
              variant="primary"
              className="w-full"
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
          )}
          {step === 4 && (
            <div className="w-full">
              {/* Mobile: a hover tooltip is useless on touch, so the reason is
                  printed above the button instead of hidden behind a hover. */}
              {payBlockedReason && (
                <div className="mb-2 text-center text-body-sm text-warning-900">
                  {payBlockedReason}
                </div>
              )}
              <Button
                variant="primary"
                className="w-full"
                onClick={payNow}
                disabled={paying || !tcAgreed || walletShortfall}
                rightIcon={<ArrowRight className="size-4" />}
              >
                {paying ? (payMethod === 'wallet' ? 'Processing…' : 'Opening secure checkout…') : payMethod === 'wallet' ? `Pay ₹${finalAmount} from wallet` : `Proceed to pay ₹${finalAmount}`}
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <h3 className="text-body-md font-semibold text-text-body">{title}</h3>
        <ChevronDown
          className={`size-4 shrink-0 text-icon-default transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open ? children : null}
    </div>
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

/**
 * Reveals a check box on mount with the same fade + rise Recriauth uses for its
 * check cards (transition-all, 400ms, ease-in-out). `index` staggers each box
 * so a grid animates in one after another.
 */
function RevealBox({
  index = 0,
  className,
  children,
}: {
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(6px)',
        transition: 'opacity 400ms ease-in-out, transform 400ms ease-in-out',
        transitionDelay: `${index * 60}ms`,
      }}
    >
      {children}
    </div>
  );
}
