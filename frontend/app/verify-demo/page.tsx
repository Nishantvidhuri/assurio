'use client';

/**
 * Demo trigger for the candidate verification flow. Enter a name + email and it
 * creates a throwaway candidate, sends a REAL verification email to that address
 * (via Resend), and shows the working link — which opens the real /verify/:token
 * page (consent → details → Aadhaar). Nothing here is a mock: the link is live.
 *
 * Once the link is created we poll the candidate's progress and show how far
 * they've got. We deliberately do NOT display the Aadhaar document / KYC — that
 * data is never stored, so only the verified status + masked number appear.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mail,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Circle,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { Button, Input, InputFieldWrapper } from '@/shared/components/ui';
import {
  verifyLinkDemoSend,
  verifyLinkInfo,
  type AadhaarKyc,
  type VerifyLinkInfo,
} from '../lib/api';

type DemoResult = { url: string; emailSent: boolean };

function tokenFromUrl(url: string): string {
  return url.split('/verify/')[1] ?? '';
}

/** One-line address from the DigiLocker structured address. */
function formatAadhaarAddress(a: AadhaarKyc['address']): string {
  if (!a) return '';
  return [
    a.house,
    a.locality,
    a.vtc,
    a.postOffice,
    a.district,
    a.state,
    a.pincode,
    a.country,
  ]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

export default function VerifyDemoPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [details, setDetails] = useState<VerifyLinkInfo | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const valid = name.trim().length > 1 && /.+@.+\..+/.test(email.trim());
  const token = result ? tokenFromUrl(result.url) : '';

  // Allow watching an existing candidate directly: /verify-demo?token=…
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    if (t) {
      setResult({ url: `${window.location.origin}/verify/${t}`, emailSent: false });
    }
  }, []);

  async function send() {
    if (!valid || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await verifyLinkDemoSend(email.trim(), name.trim());
      setResult(res);
      // Reflect the token in the URL so a refresh restores the watch view
      // instead of dropping back to the empty form.
      const t = tokenFromUrl(res.url);
      if (t) {
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}?token=${t}`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the email.');
    } finally {
      setSending(false);
    }
  }

  // Poll the candidate's progress once the link exists, so the details they
  // enter on the real page show up here live.
  const poll = useCallback(() => {
    if (!token) return;
    verifyLinkInfo(token)
      .then(setDetails)
      .catch(() => {
        /* transient — keep polling */
      });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    poll();
    pollRef.current = setInterval(poll, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [token, poll]);

  function reset() {
    setResult(null);
    setDetails(null);
    setName('');
    setEmail('');
    // Drop the ?token= so a refresh shows the fresh form again.
    window.history.replaceState(null, '', window.location.pathname);
  }

  return (
    <Shell>
      {!result ? (
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="text-xl font-semibold text-text-heading">
              Send a verification link
            </h1>
            <p className="mt-1 text-body-md text-text-body">
              Enter a candidate&apos;s name and email — we&apos;ll send them a
              real verification email. The link opens the actual consent →
              details → Aadhaar flow.
            </p>
          </div>
          <InputFieldWrapper label="Candidate name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nishant Vidhuri"
            />
          </InputFieldWrapper>
          <InputFieldWrapper label="Candidate email" required>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="candidate@example.com"
            />
          </InputFieldWrapper>
          {error && <p className="text-body-sm text-text-error">{error}</p>}
          <Button
            variant="primary"
            onClick={() => void send()}
            disabled={!valid || sending}
            isLoading={sending}
          >
            {sending ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Sending…
              </>
            ) : (
              <>
                <Mail size={16} /> Send verification email
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="size-11 text-success" />
            <h1 className="text-xl font-semibold text-text-heading">
              {result.emailSent ? 'Verification email sent' : 'Link created'}
            </h1>
            <p className="max-w-sm text-body-md text-text-body">
              {result.emailSent
                ? `We emailed ${email.trim()} a verification link. Open it from the inbox — or use the link below.`
                : `Email delivery is off, but the link is live — open it below.`}
            </p>
          </div>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-body-md font-medium text-white transition-colors hover:bg-primary-700"
          >
            <ExternalLink size={16} /> Open the verification page
          </a>
          <div className="rounded-lg border border-border-default bg-neutral-100 px-3 py-2 text-body-sm break-all text-text-body">
            {result.url}
          </div>

          <CandidateProgress details={details} />

          <Button variant="secondary" onClick={reset}>
            Send another
          </Button>
        </div>
      )}
    </Shell>
  );
}

/** Live view of the candidate's progress. The Aadhaar document / KYC is never
 *  stored, so only the verified status + masked number are shown. */
function CandidateProgress({ details }: { details: VerifyLinkInfo | null }) {
  const steps = [
    { label: 'Consent given', done: details?.termsAccepted },
    { label: 'Details submitted', done: details?.digilockerStarted },
    { label: 'Aadhaar verified', done: details?.aadhaarVerified },
  ];

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border-default bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-body-md font-semibold text-text-heading">
          Verification progress
        </h2>
        {!details ? (
          <span className="flex items-center gap-1.5 text-body-sm text-text-placeholder">
            <Loader2 size={13} className="animate-spin" /> Waiting…
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-body-sm text-text-placeholder">
            <Clock size={13} /> Live
          </span>
        )}
      </div>

      {/* Progress checklist */}
      <div className="flex flex-col gap-2">
        {steps.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-body-sm">
            {s.done ? (
              <CheckCircle2 size={16} className="shrink-0 text-success" />
            ) : (
              <Circle size={16} className="shrink-0 text-text-placeholder" />
            )}
            <span
              className={
                s.done ? 'font-medium text-text-body' : 'text-text-placeholder'
              }
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* DigiLocker client_id generated for this candidate on initialize. */}
      {details?.digilockerClientId ? (
        <div className="flex items-baseline justify-between gap-4 border-t border-border-default pt-3">
          <span className="text-body-sm text-text-placeholder">
            DigiLocker client ID
          </span>
          <span className="text-body-sm font-medium break-all text-text-body">
            {details.digilockerClientId}
          </span>
        </div>
      ) : null}

      {/* Verified KYC ("xml data") — shown from what's stored. The document
          image (photo) is never stored, so it isn't shown. */}
      {details?.aadhaar ? (
        <AadhaarKycCard kyc={details.aadhaar} />
      ) : (
        <p className="border-t border-border-default pt-3 text-body-sm text-text-placeholder">
          The candidate&apos;s progress updates here as they complete each step.
        </p>
      )}
    </div>
  );
}

/** The verified Aadhaar KYC (structured "xml data"). No document image. */
function AadhaarKycCard({ kyc }: { kyc: AadhaarKyc }) {
  const address = formatAadhaarAddress(kyc.address);
  return (
    <div className="flex flex-col gap-3 border-t border-border-default pt-3">
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} className="text-success" />
        <span className="text-body-sm font-semibold text-text-heading">
          Aadhaar details (from DigiLocker)
        </span>
      </div>

      <dl className="flex flex-col gap-2">
        <DetailRow label="Name" value={kyc.name} />
        <DetailRow label="Date of birth" value={kyc.dob} />
        <DetailRow label="Gender" value={formatGender(kyc.gender)} />
        <DetailRow label="Aadhaar number" value={kyc.uidMasked} />
      </dl>

      {address ? (
        <div className="flex flex-col gap-0.5">
          <dt className="text-body-sm text-text-placeholder">Address</dt>
          <dd className="text-body-sm font-medium text-text-body">{address}</dd>
        </div>
      ) : null}

      <p className="text-caption text-text-placeholder">
        Verified via DigiLocker. The Aadhaar document / photo is not stored.
      </p>
    </div>
  );
}

function formatGender(g: string | null): string {
  if (!g) return '';
  const v = g.trim().toUpperCase();
  if (v === 'M' || v === 'MALE') return 'Male';
  if (v === 'F' || v === 'FEMALE') return 'Female';
  return g;
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-body-sm text-text-placeholder">{label}</dt>
      <dd className="min-w-0 truncate text-right text-body-sm font-medium text-text-body">
        {value ? value : <span className="text-text-placeholder">—</span>}
      </dd>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-100 py-10">
      <div className="mx-auto flex max-w-[520px] flex-col gap-6 px-4">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="" width={30} height={30} />
          <span className="text-lg font-semibold text-text-heading">Recrify</span>
        </div>
        <div className="rounded-2xl border border-border-default bg-white p-6 shadow-sm">
          {children}
        </div>
        <p className="text-center text-body-sm text-text-placeholder">
          Secured by Recrify · Consent-first background checks
        </p>
      </div>
    </div>
  );
}
