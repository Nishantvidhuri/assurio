'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  FileSignature,
  FileText,
  Lock,
  LogOut,
  PenLine,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  candidateMe,
  candidatePatch,
  deleteCandidateDraft,
  getCandidateDraft,
  saveCandidateDraft,
  digilockerAadhaar,
  digilockerInitialize,
  digilockerStatus,
  me,
  signDocumentKeys,
  uploadIdDocument,
  verifyPan,
  type AuthUser,
  type ConsentResult,
  type Subject,
} from '../lib/api';
import { getToken } from '../lib/session';
import { doLogout } from '../lib/logout';
import Brand from '../components/Brand';

type DlState =
  | 'idle'
  | 'initializing'
  | 'awaiting'
  | 'ready'
  | 'fetching'
  | 'completed'
  | 'failed';

/* ---------- Signed image ----------
 * Renders a stored document image. Legacy base64 data-URLs and absolute URLs
 * render directly; an S3 object key is presigned on demand (own docs only). */

function SignedImage({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const [resolved, setResolved] = useState<string | null>(
    src && (src.startsWith('data:') || src.startsWith('http')) ? src : null,
  );

  useEffect(() => {
    let cancelled = false;
    if (!src) {
      setResolved(null);
      return;
    }
    if (src.startsWith('data:') || src.startsWith('http')) {
      setResolved(src);
      return;
    }
    const token = getToken();
    if (!token) return;
    setResolved(null);
    signDocumentKeys(token, [src])
      .then((urls) => {
        if (!cancelled) setResolved(urls[src] ?? null);
      })
      .catch(() => {
        if (!cancelled) setResolved(null);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!resolved) return null;
  return <img src={resolved} alt={alt} className={className} />;
}

/* ---------- Upload tile ----------
 * Uploads the file durably (presigned direct-to-S3 + background virus scan)
 * and hands the parent the resulting S3 KEY via onChange — so a crash mid-flow
 * can't lose it and the value round-trips through the server draft. Preview is
 * resolved through SignedImage. */

function UploadTile({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusLabel, setStatusLabel] = useState('Uploading…');
  const [error, setError] = useState('');

  async function handleFile(f: File) {
    setError('');
    if (!['image/png', 'image/jpeg'].includes(f.type)) {
      setError('Only PNG or JPG images are allowed.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('File must be 10MB or smaller.');
      return;
    }
    setUploading(true);
    setStatusLabel('Uploading…');
    try {
      const uploaded = await uploadIdDocument(f, (s) =>
        setStatusLabel(s === 'SCANNING' ? 'Scanning…' : 'Uploading…'),
      );
      onChange(uploaded.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }

  return (
    <div className="vf-up">
      <div className="vf-up-label">{label}</div>
      {uploading ? (
        <div className="vf-up-card vf-up-drop">
          <span className="vf-spinner" />
          <div className="vf-up-headline">{statusLabel}</div>
          <div className="vf-up-hint">Encrypted &amp; virus-scanned</div>
        </div>
      ) : value ? (
        <div className="vf-up-card vf-up-filled">
          <div className="vf-up-preview">
            <SignedImage src={value} alt={label} />
          </div>
          <div className="vf-up-meta">
            <div className="vf-up-state">
              <CheckCircle2 size={15} />
              Uploaded
            </div>
            <div className="vf-up-actions">
              <button
                type="button"
                className="vf-text-btn"
                onClick={() => ref.current?.click()}
              >
                Replace
              </button>
              <span className="vf-sep">·</span>
              <button
                type="button"
                className="vf-text-btn danger"
                onClick={() => onChange(null)}
              >
                <X size={12} strokeWidth={2.5} /> Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`vf-up-card vf-up-drop ${drag ? 'is-drag' : ''}`}
          onClick={() => ref.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') ref.current?.click();
          }}
        >
          <div className="vf-up-icon">
            <Upload size={18} />
          </div>
          <div className="vf-up-headline">
            Drag and drop image, or <span className="vf-up-cta">browse</span>
          </div>
          <div className="vf-up-hint">{hint}</div>
        </div>
      )}
      {error && <div className="vf-up-err">{error}</div>}
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={onPick}
      />
    </div>
  );
}

/* ---------- Floating label input ---------- */

function FloatField({
  id,
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  helper,
  valid,
  adjustCursor,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  helper?: string;
  valid?: boolean;
  /** Given the raw cursor position + raw value, return the cursor position to
   *  restore after the parent's onChange transforms the value. */
  adjustCursor?: (rawCursor: number, rawValue: string) => number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCursor = useRef<number | null>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (pendingCursor.current !== null && el && el === document.activeElement) {
      el.setSelectionRange(pendingCursor.current, pendingCursor.current);
      pendingCursor.current = null;
    }
  });

  return (
    <div className={`vf-float ${value ? 'is-filled' : ''} ${valid ? 'is-valid' : ''}`}>
      <input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => {
          const rawCursor = e.target.selectionStart ?? e.target.value.length;
          const rawValue = e.target.value;
          pendingCursor.current = adjustCursor
            ? adjustCursor(rawCursor, rawValue)
            : rawCursor;
          onChange(rawValue);
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
      />
      <label htmlFor={id}>{label}</label>
      {valid && (
        <span className="vf-float-ok">
          <CheckCircle2 size={15} />
        </span>
      )}
      {helper && <div className="vf-helper">{helper}</div>}
    </div>
  );
}

/* ---------- Page ---------- */

export default function CandidatePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);

  const [panFront, setPanFront] = useState<string | null>(null);
  const [panBack, setPanBack] = useState<string | null>(null);
  const [panNumber, setPanNumber] = useState('');
  const [aadhaarFront, setAadhaarFront] = useState<string | null>(null);
  const [aadhaarBack, setAadhaarBack] = useState<string | null>(null);
  const [aadhaarNumber, setAadhaarNumber] = useState('');

  const [panVerifying, setPanVerifying] = useState(false);
  const [panVerifyError, setPanVerifyError] = useState('');

  // Draft auto-save state
  const [draftStatus, setDraftStatus] = useState<'idle' | 'pending' | 'saved'>('idle');
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [dlState, setDlState] = useState<DlState>('idle');
  const [dlClientId, setDlClientId] = useState<string | null>(null);
  const [dlUrl, setDlUrl] = useState<string | null>(null);
  const [dlError, setDlError] = useState('');
  const dlCancelled = useRef(false);

  const [menuOpen, setMenuOpen] = useState(false);

  const [consentMode, setConsentMode] = useState<'TYPED' | 'UPLOADED'>('TYPED');
  const [typedSig, setTypedSig] = useState('');
  const [uploadedSig, setUploadedSig] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentError, setConsentError] = useState('');
  const [letterOpen, setLetterOpen] = useState(false);

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
        if (u.role !== 'candidate') {
          router.replace(u.role === 'admin' ? '/admin' : '/home');
          return;
        }
        setUser(u);
        const s = await candidateMe(token);
        if (cancelled) return;
        setSubject(s);
        // Start with committed values, then overlay any pending draft.
        let pf = s.panFront ?? null;
        let pb = s.panBack ?? null;
        let pn = s.panNumber ?? '';
        let af = s.aadhaarFront ?? null;
        let ab = s.aadhaarBack ?? null;
        let an = s.aadhaarNumber ?? '';
        const draft = await getCandidateDraft(token).catch(() => null);
        if (draft?.patch) {
          const p = draft.patch;
          if (p.panFront !== undefined) pf = p.panFront ?? null;
          if (p.panBack !== undefined) pb = p.panBack ?? null;
          if (p.panNumber !== undefined) pn = p.panNumber ?? '';
          if (p.aadhaarFront !== undefined) af = p.aadhaarFront ?? null;
          if (p.aadhaarBack !== undefined) ab = p.aadhaarBack ?? null;
          if (p.aadhaarNumber !== undefined) an = p.aadhaarNumber ?? '';
        }
        if (cancelled) return;
        setPanFront(pf);
        setPanBack(pb);
        setPanNumber(pn);
        setAadhaarFront(af);
        setAadhaarBack(ab);
        setAadhaarNumber(formatAadhaar(an));
        if (s.aadhaarResult) {
          setDlClientId(s.digilockerClientId ?? null);
          setDlUrl(s.digilockerUrl ?? null);
          setDlState('completed');
        } else if (s.digilockerClientId) {
          setDlClientId(s.digilockerClientId);
          setDlUrl(s.digilockerUrl ?? null);
          setDlState('awaiting');
        }
      } catch {
        if (cancelled) return;
        doLogout(router);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (dlState !== 'awaiting' || !dlClientId) return;
    dlCancelled.current = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (dlCancelled.current) return;
      const token = getToken();
      if (!token) return;
      try {
        const status = await digilockerStatus(token, dlClientId);
        if (dlCancelled.current) return;
        if (status.completed) setDlState('ready');
        else if (status.failed) {
          setDlError(
            status.errorDescription || 'DigiLocker verification failed',
          );
          setDlState('failed');
        } else {
          timer = setTimeout(tick, 3000);
        }
      } catch {
        if (!dlCancelled.current) timer = setTimeout(tick, 5000);
      }
    };
    timer = setTimeout(tick, 1500);
    return () => {
      dlCancelled.current = true;
      clearTimeout(timer);
    };
  }, [dlState, dlClientId]);

  function handleLogout() {
    doLogout(router);
  }

  // Debounce: wait 1 s after the last change, then ship the draft to the server.
  // The server holds it in BullMQ for 20 s before committing; any new call
  // within that window resets the timer so we never write partial state.
  function scheduleDraft(patch: Partial<Subject>) {
    setDraftStatus('pending');
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(async () => {
      const token = getToken();
      if (!token) return;
      try {
        await saveCandidateDraft(token, patch);
        setDraftStatus('saved');
      } catch {
        setDraftStatus('idle');
      }
    }, 1_000);
  }

  async function handleVerifyPan() {
    setPanVerifyError('');
    setPanVerifying(true);
    try {
      const token = getToken();
      if (!token) throw new Error('Your session has expired.');
      const panData = await verifyPan(token, panNumber.trim());
      await candidatePatch(token, { panResult: panData });
      setSubject((s) => (s ? { ...s, panResult: panData } : s));
    } catch (err) {
      setPanVerifyError(
        err instanceof Error ? err.message : 'PAN verification failed.',
      );
    } finally {
      setPanVerifying(false);
    }
  }

  async function handleSubmit() {
    setSaveError('');
    setSaving(true);
    try {
      const token = getToken();
      if (!token) throw new Error('Your session has expired.');

      // Cancel any pending draft — we're committing explicitly now.
      if (draftTimer.current) clearTimeout(draftTimer.current);
      await deleteCandidateDraft(token).catch(() => {});
      setDraftStatus('idle');

      const trimmedPan = panNumber.trim();
      await candidatePatch(token, {
        panFront,
        panBack,
        panNumber: trimmedPan || null,
        aadhaarFront,
        aadhaarBack,
        aadhaarNumber: aadhaarNumber.replace(/\s/g, '').trim() || null,
      });

      // Only verify PAN here if not already verified via the Verify PAN button.
      if (trimmedPan && !subject?.panResult) {
        const panData = await verifyPan(token, trimmedPan);
        await candidatePatch(token, { panResult: panData });
        setSubject((s) => (s ? { ...s, panResult: panData } : s));
      }

      setSubmitted(true);
      setTimeout(() => {
        document
          .querySelector('.vf-consent')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : 'Could not save your details. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function startDigiLocker() {
    setDlError('');
    setDlState('initializing');
    try {
      const token = getToken();
      if (!token) throw new Error('Your session has expired.');
      const data = await digilockerInitialize(token);
      setDlClientId(data.client_id);
      setDlUrl(data.url);
      await candidatePatch(token, {
        digilockerClientId: data.client_id,
        digilockerUrl: data.url,
        aadhaarResult: null,
      });
      window.open(data.url, '_blank', 'noopener,noreferrer');
      setDlState('awaiting');
    } catch (err) {
      setDlError(
        err instanceof Error ? err.message : 'Could not start DigiLocker',
      );
      setDlState('failed');
    }
  }

  async function fetchAadhaar() {
    if (!dlClientId) return;
    setDlError('');
    setDlState('fetching');
    try {
      const token = getToken();
      if (!token) throw new Error('Your session has expired.');
      const data = await digilockerAadhaar(token, dlClientId);
      await candidatePatch(token, { aadhaarResult: data });
      setSubject((s) => (s ? { ...s, aadhaarResult: data } : s));
      setDlState('completed');
    } catch (err) {
      setDlError(
        err instanceof Error ? err.message : 'Failed to fetch Aadhaar',
      );
      setDlState('failed');
    }
  }

  async function submitConsent() {
    if (!subject) return;
    setConsentError('');
    const expectedName = (subject.name || '').trim();
    const typedTrim = typedSig.trim();
    if (consentMode === 'TYPED') {
      if (!expectedName) {
        setConsentError('Your record is missing a name — contact your inviter.');
        return;
      }
      if (typedTrim.toLowerCase() !== expectedName.toLowerCase()) {
        setConsentError(
          'Type your full legal name exactly as it appears on your record.',
        );
        return;
      }
    } else if (!uploadedSig) {
      setConsentError('Upload an image of your signature to continue.');
      return;
    }
    if (!agreed) {
      setConsentError('Please confirm the agreement to continue.');
      return;
    }

    setConsentSaving(true);
    try {
      const token = getToken();
      if (!token) throw new Error('Your session has expired.');
      const result: ConsentResult = {
        mode: consentMode,
        signerName: expectedName,
        typedSignatureText: consentMode === 'TYPED' ? typedTrim : null,
        signatureImage: consentMode === 'UPLOADED' ? uploadedSig : null,
        acceptedAt: new Date().toISOString(),
      };
      await candidatePatch(token, { consentResult: result });
      setSubject((s) => (s ? { ...s, consentResult: result } : s));
    } catch (err) {
      setConsentError(
        err instanceof Error ? err.message : 'Unable to record consent',
      );
    } finally {
      setConsentSaving(false);
    }
  }

  if (!user || !subject) return <div className="vf-loading">Loading…</div>;

  const panValid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber);
  const aadhaarRaw = aadhaarNumber.replace(/\s/g, '');
  const aadhaarValid = /^\d{12}$/.test(aadhaarRaw);

  const allDataComplete =
    !!panFront &&
    !!panBack &&
    panValid &&
    !!aadhaarFront &&
    !!aadhaarBack &&
    aadhaarValid;
  const consent = subject.consentResult;
  const expectedName = (subject.name || '').trim();
  const typedTrim = typedSig.trim();
  const typedMatches =
    expectedName.length > 0 &&
    typedTrim.toLowerCase() === expectedName.toLowerCase();
  const showTypedMismatch =
    expectedName.length > 0 && typedTrim.length > 0 && !typedMatches;
  const signatureReady =
    consentMode === 'TYPED' ? typedMatches : !!uploadedSig;
  const canSubmitConsent = signatureReady && agreed && !consentSaving;

  return (
    <div className="vf">
      {/* Sticky top nav */}
      <header className="vf-nav">
        <div className="vf-nav-inner">
          <Brand />
          <div className="vf-menu" onMouseLeave={() => setMenuOpen(false)}>
            <button
              className="vf-profile"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="vf-avatar">
                {(user.name || '?').charAt(0).toUpperCase()}
              </span>
              <span className="vf-profile-name">{user.name}</span>
              <ChevronDown size={14} className={menuOpen ? 'rot' : ''} />
            </button>
            {menuOpen && (
              <div className="vf-menu-pop">
                <div className="vf-menu-user">
                  <div className="vf-menu-name">{user.name}</div>
                  <div className="vf-menu-mail">{user.email}</div>
                </div>
                <button className="vf-menu-item" onClick={handleLogout}>
                  <LogOut size={14} />
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="vf-main">
        {/* Hero */}
        <div className="vf-hero">
          <div className="vf-hero-chip">
            <ShieldCheck size={13} />
            Identity verification
          </div>
          <h1 className="vf-hero-title">
            Your <em>verification</em>
          </h1>
          <p className="vf-hero-sub">
            Upload your identity documents and sign a quick consent to complete
            your background verification.
          </p>
          <div className="vf-trust-row">
            <span className="vf-trust">
              <Lock size={12} /> Secure
            </span>
            <span className="vf-trust">
              <ShieldCheck size={12} /> Encrypted
            </span>
            <span className="vf-trust">
              <Sparkles size={12} /> Consent-based
            </span>
          </div>
        </div>

        {/* Card container */}
        <div className="vf-card">
          {/* PAN section */}
          <section className="vf-section">
            <div className="vf-section-head">
              <div className="vf-section-ico">
                <CreditCard size={16} />
              </div>
              <div>
                <h2 className="vf-section-title">PAN Card</h2>
                <p className="vf-section-sub">
                  Upload PAN details for identity verification.
                </p>
              </div>
            </div>
            <div className="vf-grid-2">
              <UploadTile
                label="PAN Front"
                hint="PNG or JPG up to 10MB"
                value={panFront}
                onChange={(v) => { setPanFront(v); scheduleDraft({ panFront: v, panBack, panNumber, aadhaarFront, aadhaarBack, aadhaarNumber: aadhaarNumber.replace(/\s/g, '') }); }}
              />
              <UploadTile
                label="PAN Back"
                hint="PNG or JPG up to 10MB"
                value={panBack}
                onChange={(v) => { setPanBack(v); scheduleDraft({ panFront, panBack: v, panNumber, aadhaarFront, aadhaarBack, aadhaarNumber: aadhaarNumber.replace(/\s/g, '') }); }}
              />
            </div>
            <FloatField
              id="pan-num"
              label="PAN Number"
              placeholder="ABCDE1234F"
              value={panNumber}
              onChange={(v) => {
                const cleaned = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
                setPanNumber(cleaned);
                setPanVerifyError('');
                if (subject?.panResult) setSubject((s) => s ? { ...s, panResult: null } : s);
                scheduleDraft({ panFront, panBack, panNumber: cleaned, aadhaarFront, aadhaarBack, aadhaarNumber: aadhaarNumber.replace(/\s/g, '') });
              }}
              maxLength={10}
              valid={panValid}
              adjustCursor={(cur, raw) =>
                raw.slice(0, cur).replace(/[^A-Za-z0-9]/g, '').length
              }
            />

            <div className="vf-dl-row">
              {subject?.panResult ? (
                <span className="vf-dl-pill is-done">
                  <CheckCircle2 size={14} />
                  PAN verified
                </span>
              ) : (
                <button
                  type="button"
                  className="vf-btn vf-btn-ghost"
                  onClick={handleVerifyPan}
                  disabled={!panValid || panVerifying}
                >
                  {panVerifying ? (
                    <>
                      <span className="vf-spinner" />
                      Verifying…
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={14} />
                      Verify PAN
                    </>
                  )}
                </button>
              )}
              {panVerifyError && (
                <span className="vf-dl-err">{panVerifyError}</span>
              )}
            </div>
          </section>

          <div className="vf-divider" />

          {/* Aadhaar section */}
          <section className="vf-section">
            <div className="vf-section-head">
              <div className="vf-section-ico">
                <FileText size={16} />
              </div>
              <div>
                <h2 className="vf-section-title">Aadhaar Card</h2>
                <p className="vf-section-sub">
                  Upload your Aadhaar card details.
                </p>
              </div>
            </div>
            <div className="vf-grid-2">
              <UploadTile
                label="Aadhaar Front"
                hint="PNG or JPG up to 10MB"
                value={aadhaarFront}
                onChange={(v) => { setAadhaarFront(v); scheduleDraft({ panFront, panBack, panNumber, aadhaarFront: v, aadhaarBack, aadhaarNumber: aadhaarNumber.replace(/\s/g, '') }); }}
              />
              <UploadTile
                label="Aadhaar Back"
                hint="PNG or JPG up to 10MB"
                value={aadhaarBack}
                onChange={(v) => { setAadhaarBack(v); scheduleDraft({ panFront, panBack, panNumber, aadhaarFront, aadhaarBack: v, aadhaarNumber: aadhaarNumber.replace(/\s/g, '') }); }}
              />
            </div>
            <FloatField
              id="aadhaar-num"
              label="Aadhaar Number"
              placeholder="XXXX XXXX XXXX"
              value={aadhaarNumber}
              onChange={(v) => {
                const formatted = formatAadhaar(v);
                setAadhaarNumber(formatted);
                scheduleDraft({ panFront, panBack, panNumber, aadhaarFront, aadhaarBack, aadhaarNumber: formatted.replace(/\s/g, '') });
              }}
              maxLength={14}
              helper="Used only for verification. Never shared."
              valid={aadhaarValid}
              adjustCursor={(cur, raw) => {
                const digitsBefore = raw.slice(0, cur).replace(/\D/g, '').length;
                const formatted = formatAadhaar(raw);
                let count = 0;
                for (let i = 0; i < formatted.length; i++) {
                  if (/\d/.test(formatted[i])) {
                    count++;
                    if (count === digitsBefore) return i + 1;
                  }
                }
                return formatted.length;
              }}
            />

            <div className="vf-dl-row">
              {dlState === 'completed' ? (
                <span className="vf-dl-pill is-done">
                  <CheckCircle2 size={14} />
                  Aadhaar verified via DigiLocker
                </span>
              ) : dlState === 'awaiting' ? (
                <span className="vf-dl-pill">
                  <span className="vf-spinner" />
                  Waiting for DigiLocker
                  {dlUrl && (
                    <a
                      className="vf-text-btn"
                      href={dlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Reopen
                    </a>
                  )}
                </span>
              ) : dlState === 'fetching' ? (
                <span className="vf-dl-pill">
                  <span className="vf-spinner" />
                  Fetching Aadhaar…
                </span>
              ) : dlState === 'ready' ? (
                <button
                  type="button"
                  className="vf-btn vf-btn-ghost"
                  onClick={fetchAadhaar}
                >
                  <ShieldCheck size={14} />
                  Fetch Aadhaar
                </button>
              ) : (
                <button
                  type="button"
                  className="vf-btn vf-btn-ghost"
                  onClick={startDigiLocker}
                  disabled={dlState === 'initializing'}
                >
                  {dlState === 'initializing' ? (
                    <>
                      <span className="vf-spinner" />
                      Starting…
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={14} />
                      {dlState === 'failed' ? 'Try DigiLocker again' : 'Verify with DigiLocker'}
                    </>
                  )}
                </button>
              )}
              {dlError && dlState !== 'awaiting' && dlState !== 'fetching' && (
                <span className="vf-dl-err">{dlError}</span>
              )}
            </div>
          </section>

          {saveError && <div className="vf-error">{saveError}</div>}

          {/* Submit CTA — locks data in and reveals the consent step. */}
          <div className="vf-cta-row">
            <div className="vf-cta-meta">
              <ShieldCheck size={14} />
              Submit your details to continue to consent.
              {draftStatus === 'pending' && <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 12 }}>Saving draft…</span>}
              {draftStatus === 'saved' && <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 12 }}>Draft saved</span>}
            </div>
            <button
              className="vf-btn"
              onClick={handleSubmit}
              disabled={saving || !allDataComplete || submitted}
            >
              {saving ? (
                <>
                  <span className="vf-spinner" />
                  Submitting…
                </>
              ) : submitted ? (
                <>
                  <CheckCircle2 size={15} />
                  Submitted
                </>
              ) : (
                <>
                  Submit
                  <CheckCircle2 size={15} />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Consent step — only shown after the candidate clicks Submit. */}
        {consent ? (
          <div className="vf-card vf-consent vf-consent-done">
            <div className="vf-consent-head">
              <div className="vf-section-ico">
                <CheckCircle2 size={16} />
              </div>
              <div>
                <h2 className="vf-section-title">Consent accepted</h2>
                <p className="vf-section-sub">
                  You&apos;ve agreed to the background-verification process.
                </p>
              </div>
              <span className="vf-badge">
                <CheckCircle2 size={13} />
                Signed
              </span>
            </div>
            <dl className="vf-consent-summary">
              <div>
                <dt>Signed as</dt>
                <dd>{consent.signerName || '—'}</dd>
              </div>
              <div>
                <dt>Signature</dt>
                <dd>
                  {consent.mode === 'TYPED' ? 'Typed signature' : 'Uploaded image'}
                </dd>
              </div>
              <div>
                <dt>Accepted on</dt>
                <dd>{formatAcceptedAt(consent.acceptedAt)}</dd>
              </div>
            </dl>
            {consent.mode === 'TYPED' && consent.typedSignatureText && (
              <div className="vf-sig-preview vf-sig-preview-done">
                {consent.typedSignatureText}
              </div>
            )}
            {consent.mode === 'UPLOADED' && consent.signatureImage && (
              <div className="vf-sig-image">
                <SignedImage src={consent.signatureImage} alt="Signature" />
              </div>
            )}
          </div>
        ) : submitted ? (
          <div className="vf-card vf-consent">
            <div className="vf-section-head">
              <div className="vf-section-ico">
                <FileSignature size={16} />
              </div>
              <div>
                <h2 className="vf-section-title">Consent form</h2>
                <p className="vf-section-sub">
                  Please read carefully and sign with your full legal name to
                  authorise verification.
                </p>
              </div>
            </div>

            <div className="vf-callout">
              <div className="vf-callout-ico">
                <BookOpen size={15} />
              </div>
              <div className="vf-callout-body">
                <div className="vf-callout-title">
                  Read the consent letter before signing.
                </div>
                <p className="vf-callout-sub">
                  Authorises the Hiring Organisation and Recrify to run your
                  background verification.
                </p>
              </div>
              <button
                type="button"
                className="vf-text-btn"
                onClick={() => setLetterOpen(true)}
              >
                View consent letter
              </button>
            </div>

            <div className="vf-radio-row">
              <label className="vf-radio">
                <input
                  type="radio"
                  name="consent-mode"
                  checked={consentMode === 'TYPED'}
                  onChange={() => setConsentMode('TYPED')}
                />
                <span className="vf-radio-icon">
                  <PenLine size={14} />
                </span>
                Type signature
              </label>
              <label className="vf-radio">
                <input
                  type="radio"
                  name="consent-mode"
                  checked={consentMode === 'UPLOADED'}
                  onChange={() => setConsentMode('UPLOADED')}
                />
                <span className="vf-radio-icon">
                  <Upload size={14} />
                </span>
                Upload signature
              </label>
            </div>

            <FloatField
              id="consent-name"
              label={`Full legal name (must match "${expectedName || 'your record'}")`}
              placeholder={expectedName || 'Your full name'}
              value={typedSig}
              onChange={setTypedSig}
              valid={typedMatches}
              helper={
                showTypedMismatch
                  ? 'Name must match exactly as it appears on your record.'
                  : undefined
              }
            />

            {consentMode === 'TYPED' ? (
              <div
                className={`vf-sig-preview ${
                  showTypedMismatch ? 'is-error' : ''
                } ${typedMatches ? 'is-valid' : ''}`}
              >
                {typedTrim || <span className="vf-sig-placeholder">Your signature appears here</span>}
              </div>
            ) : (
              <UploadTile
                label="Signature image"
                hint="PNG or JPG of your handwritten signature"
                value={uploadedSig}
                onChange={setUploadedSig}
              />
            )}

            <label className="vf-agree">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span className="vf-agree-box" aria-hidden="true">
                {agreed && <CheckCircle2 size={12} />}
              </span>
              I agree to the entire background-verification process.
            </label>

            {consentError && (
              <div className="vf-error vf-error-inline">{consentError}</div>
            )}

            <div className="vf-cta-row">
              <div className="vf-cta-meta">
                <ShieldCheck size={14} />
                Your signature is encrypted and stored securely.
              </div>
              <button
                className="vf-btn"
                onClick={submitConsent}
                disabled={!canSubmitConsent}
              >
                {consentSaving ? (
                  <>
                    <span className="vf-spinner" />
                    Recording…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    Accept &amp; Submit
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}
      </main>

      {letterOpen && (
        <ConsentLetterDialog
          candidateName={subject.name || ''}
          onClose={() => setLetterOpen(false)}
        />
      )}
    </div>
  );
}

function ConsentLetterDialog({
  candidateName,
  onClose,
}: {
  candidateName: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const NAME = candidateName.trim() || 'the Candidate';
  const ORG = 'the Hiring Organisation';

  return (
    <div className="vf-modal" role="dialog" aria-modal="true" aria-label="Letter of Consent">
      <button className="vf-modal-scrim" aria-label="Close" onClick={onClose} />
      <div className="vf-modal-card">
        <header className="vf-modal-head">
          <div className="vf-modal-eyebrow">
            <FileSignature size={12} />
            Letter of Consent
          </div>
          <button
            type="button"
            className="vf-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="vf-modal-body">
          <h2 className="vf-modal-title">Letter of Consent</h2>
          <div className="vf-letter">
            <p>
              I, <strong>{NAME}</strong>, hereby authorize {ORG} and its
              background verification platform <strong>Recrify</strong>,
              including its partners, agents, contractors, or subcontractors
              (collectively referred to as the &ldquo;Company&rdquo;), to
              conduct background verification checks in relation to my
              application for employment.
            </p>
            <p>
              I understand that the background verification process may include
              verification of my educational qualifications (authentication of
              completed or ongoing degrees/diplomas), employment history, court
              records including criminal verification (as permitted by law),
              Permanent Account Number (PAN) verification, address verification,
              and any other checks deemed necessary by the Company.
            </p>
            <p>
              I further acknowledge and agree that such verification reports may
              be obtained before or during my employment, and may be conducted
              more than once if required. I provide my consent to the Company
              to process any sensitive personal information required for the
              purpose of verification and to contact me if any additional
              information or clarification is needed.
            </p>
            <p>
              I hereby authorize all previous employers, educational
              institutions, consumer reporting agencies, and other relevant
              entities to disclose any necessary information about me to the
              Company or to any third party authorized by the Company for the
              purpose of completing the background verification process.
            </p>
            <p>
              I understand that the continuation or offer of employment may be
              subject to the outcome of the background verification process
              conducted by the Company.
            </p>
            <p>
              I confirm that all information provided by me in the Background
              Verification Form is true and accurate to the best of my
              knowledge. I also agree that a photocopy, scanned copy, or
              digitally signed version of this consent shall be considered
              legally valid and equivalent to the original document.
            </p>
          </div>
        </div>
        <footer className="vf-modal-foot">
          <button type="button" className="vf-btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

function formatAcceptedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

/* ---------- helpers ---------- */

function formatAadhaar(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 12);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}
