'use client';

/**
 * Public candidate verification flow — reached by an emailed link, no login.
 * Three steps: (1) consent to the Terms & Conditions, (2) confirm details
 * (name / mobile / email / Aadhaar number), (3) complete Aadhaar via DigiLocker
 * with live progress. Backed by the public /verify-link/:token endpoints.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, ShieldCheck, ExternalLink, Loader2, AlertTriangle } from 'lucide-react';
import TermsBox from '../../components/TermsBox';
import {
  Button,
  Divider,
  Input,
  InputFieldWrapper,
  PhoneInput,
  Stepper,
  type StepperItem,
  type StepperStatus,
} from '@/shared/components/ui';
import {
  verifyLinkInfo,
  verifyLinkConsent,
  verifyLinkDecline,
  verifyLinkUpdate,
  verifyLinkDigilockerInit,
  verifyLinkDigilockerStatus,
  verifyLinkFetchAadhaar,
  type VerifyLinkInfo,
} from '../../lib/api';

type Step = 'consent' | 'form' | 'aadhaar' | 'done' | 'declined';
type DlState = 'idle' | 'initializing' | 'awaiting' | 'fetching' | 'failed';

export default function VerifyPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';

  const [info, setInfo] = useState<VerifyLinkInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('consent');

  // consent
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);

  // form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [aadhaar, setAadhaar] = useState('');

  // aadhaar / digilocker
  const [dl, setDl] = useState<DlState>('idle');
  const [dlUrl, setDlUrl] = useState<string | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    verifyLinkInfo(token)
      .then((res) => {
        if (cancelled) return;
        setInfo(res);
        setName(res.candidateName);
        setPhone(res.phone);
        setEmail(res.email);
        setAadhaar(res.aadhaarNumber);
        setStep(
          res.consentStatus === 'DECLINED' || res.consentStatus === 'EXPIRED'
            ? 'declined'
            : res.aadhaarVerified
              ? 'done'
              : res.digilockerStarted
                ? 'aadhaar'
                : res.termsAccepted
                  ? 'form'
                  : 'consent',
        );
        if (res.termsAccepted) setAgreed(true);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Invalid link');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Poll DigiLocker status while awaiting consent in the opened tab.
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const finishAadhaar = useCallback(async () => {
    stopPolling();
    setDl('fetching');
    try {
      await verifyLinkFetchAadhaar(token);
      setStep('done');
    } catch (err) {
      setDlError(err instanceof Error ? err.message : 'Could not fetch Aadhaar.');
      setDl('failed');
    }
  }, [token, stopPolling]);

  useEffect(() => {
    if (dl !== 'awaiting') return;
    pollRef.current = setInterval(() => {
      verifyLinkDigilockerStatus(token)
        .then((s) => {
          if (s.completed) void finishAadhaar();
          else if (s.failed) {
            stopPolling();
            setDlError(s.errorDescription || 'DigiLocker verification failed.');
            setDl('failed');
          }
        })
        .catch(() => {
          /* transient — keep polling */
        });
    }, 3000);
    return stopPolling;
  }, [dl, token, finishAadhaar, stopPolling]);

  async function acceptTerms() {
    if (!agreed || submitting) return;
    setSubmitting(true);
    try {
      await verifyLinkConsent(token);
      setStep('form');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save your consent.');
    } finally {
      setSubmitting(false);
    }
  }

  async function declineConsent() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await verifyLinkDecline(token);
      setDeclineOpen(false);
      setStep('declined');
    } catch (err) {
      setDeclineError(
        err instanceof Error ? err.message : 'Could not record your decision.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function saveDetails() {
    if (submitting) return;
    if (!name.trim()) return alert('Please enter your name.');
    if (!/^\d{12}$/.test(aadhaar.replace(/\s+/g, ''))) {
      return alert('Please enter a valid 12-digit Aadhaar number.');
    }
    setSubmitting(true);
    try {
      await verifyLinkUpdate(token, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        aadhaarNumber: aadhaar.replace(/\s+/g, ''),
      });
      setStep('aadhaar');
      // Generate the DigiLocker link now (on submit), not before — then hand off.
      void startDigiLocker();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save your details.');
    } finally {
      setSubmitting(false);
    }
  }

  async function startDigiLocker() {
    setDl('initializing');
    setDlError(null);
    try {
      const { url } = await verifyLinkDigilockerInit(token);
      setDlUrl(url);
      if (url) window.open(url, '_blank', 'noopener');
      setDl('awaiting');
    } catch (err) {
      setDlError(err instanceof Error ? err.message : 'Could not start DigiLocker.');
      setDl('failed');
    }
  }

  /* ---------- render ---------- */

  const order: Step[] = ['consent', 'form', 'aadhaar', 'done'];
  const curIdx = order.indexOf(step);

  // Field validation for the details step.
  const aadhaarDigits = aadhaar.replace(/\D/g, '');
  const aadhaarValid = aadhaarDigits.length === 12;
  const emailValid = /.+@.+\..+/.test(email.trim());
  const phoneValid = phone.replace(/\D/g, '').length >= 10;
  const formValid =
    name.trim().length > 1 && emailValid && phoneValid && aadhaarValid;
  const stepStatus = (i: number): StepperStatus =>
    step === 'done' || i < curIdx
      ? 'completed'
      : i === curIdx
        ? 'ongoing'
        : 'not_started';
  const stepItems: StepperItem[] = [
    { id: 'consent', title: 'Consent', status: stepStatus(0) },
    { id: 'form', title: 'Your details', status: stepStatus(1) },
    { id: 'aadhaar', title: 'Aadhaar', status: stepStatus(2) },
  ];
  // Allow jumping back to an already-completed / current step only.
  const goToStep = (id: string) => {
    const t = order.indexOf(id as Step);
    if (t >= 0 && t <= curIdx && step !== 'done') setStep(id as Step);
  };

  if (loadError) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertTriangle className="size-10 text-failure" />
          <h1 className="text-xl font-semibold text-text-heading">Link not valid</h1>
          <p className="max-w-sm text-body-md text-text-body">{loadError}</p>
        </div>
      </Shell>
    );
  }
  if (!info) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-7 animate-spin text-primary" />
        </div>
      </Shell>
    );
  }

  // Declined is terminal — there is no flow left to show, so drop the stepper
  // and the form header rather than leaving three empty steps on screen.
  if (step === 'declined') {
    return (
      <Shell centered>
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="size-10 text-warning" />
          <h1 className="text-xl font-semibold text-text-heading">
            Verification declined
          </h1>
          <p className="max-w-md text-body-md text-text-body">
            Thanks for letting us know. This request is now closed and none of
            your details were checked. You can safely close this page.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-h3 font-semibold tracking-h3 text-text-heading">
          Candidate Form
        </h1>
        <p className="text-body-md text-text-subheading">
          This information will be used to complete your background verification.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-0">
        {/* Desktop vertical stepper rail */}
        <aside className="hidden shrink-0 self-start lg:sticky lg:top-6 lg:block lg:w-[190px]">
          <Stepper
            items={stepItems}
            orientation="vertical"
            connectorLength={20}
            onItemClick={goToStep}
          />
        </aside>

        {/* Tablet horizontal stepper */}
        <div className="hidden md:block lg:hidden">
          <Stepper
            items={stepItems}
            orientation="horizontal"
            onItemClick={goToStep}
          />
        </div>

        {/* Mobile horizontal stepper (start-aligned so labels fit narrow screens) */}
        <div className="md:hidden">
          <Stepper
            items={stepItems}
            orientation="horizontal"
            horizontalAlign="start"
            onItemClick={goToStep}
          />
        </div>

        <Divider
          orientation="Vertical"
          emphasis="Low"
          className="ml-9 mr-12 hidden self-stretch !h-auto lg:block"
        />

        <section className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col gap-6">

      {step === 'consent' && (
        <div className="flex flex-col gap-5">
          {/* Compact consent callout — request summary + the action buttons. */}
          <div className="rounded-xl border border-border-focused bg-surface-info p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-200 text-primary">
                <ShieldCheck size={16} />
              </span>
              <div className="min-w-0">
                <h1 className="text-base font-semibold text-text-heading">
                  {info.clientName} has started your background verification
                </h1>
                <p className="mt-0.5 text-body-sm text-text-subheading">
                  Review the Terms &amp; Conditions below, then give your consent
                  to continue. You can decline any time — nothing about you is
                  verified or stored.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setDeclineError(null);
                  setDeclineOpen(true);
                }}
                disabled={submitting}
                className="w-full rounded-lg"
              >
                I refuse to start
              </Button>
            </div>
          </div>
          {/* Exactly what the candidate is consenting to — server-derived from
              the details the client provided. Nothing runs until they agree. */}
          {info.checks && info.checks.length > 0 && (
            <div className="rounded-xl border border-border-default bg-neutral-100 p-4">
              <h2 className="text-body-md font-semibold text-text-heading">
                What will be verified
              </h2>
              <p className="mt-0.5 text-body-sm text-text-subheading">
                These checks start only after you tap Agree &amp; continue —
                nothing has been checked yet.
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {info.checks.map((c) => (
                  <li
                    key={c.key}
                    className="flex items-center gap-2 text-body-md text-text-body"
                  >
                    <CheckCircle2 size={15} className="shrink-0 text-success" />
                    {c.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <TermsBox
            agreed={agreed}
            onAgreedChange={setAgreed}
            label={
              <>
                I, <strong>{info.candidateName}</strong>, have read and agree to the
                Terms &amp; Conditions, and consent to Assurio verifying my details
                on behalf of {info.clientName}.
              </>
            }
          />
          <Button
            variant="primary"
            onClick={() => void acceptTerms()}
            disabled={!agreed || submitting}
            isLoading={submitting}
            className="h-12! w-full rounded-lg text-body-lg!"
          >
            Agree &amp; continue
          </Button>
        </div>
      )}

      {step === 'form' && (
        <div className="flex flex-col gap-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-h4 text-text-heading md:text-h4">
              Personal Information
            </h2>
            <p className="text-body-sm text-text-subheading">
              Make sure these match your Aadhaar records.
            </p>
          </div>

          <div className="grid gap-x-5 gap-y-5 md:grid-cols-2">
            <InputFieldWrapper label="Name" required className="md:col-span-2">
              <Input
                value={name}
                placeholder="Enter name"
                onChange={(e) => setName(e.target.value)}
              />
            </InputFieldWrapper>

            <InputFieldWrapper label="Email" required>
              <Input
                type="email"
                value={email}
                placeholder="Enter your email"
                onChange={(e) => setEmail(e.target.value)}
              />
            </InputFieldWrapper>

            <InputFieldWrapper label="Contact Number" required>
              <PhoneInput
                defaultCountry="IN"
                value={phone}
                onChange={(next) => setPhone(String(next ?? ''))}
              />
            </InputFieldWrapper>

            <InputFieldWrapper
              label="Aadhaar Number"
              required
              className="md:col-span-2"
              error={
                aadhaar.length > 0 && !aadhaarValid
                  ? `Aadhaar number must be exactly 12 digits (${aadhaarDigits.length}/12).`
                  : undefined
              }
            >
              <Input
                value={aadhaar}
                placeholder="Enter 12-digit Aadhaar number"
                inputMode="numeric"
                maxLength={12}
                onChange={(e) =>
                  setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))
                }
              />
            </InputFieldWrapper>
          </div>

          <Button
            variant="primary"
            onClick={() => void saveDetails()}
            disabled={submitting || !formValid}
            isLoading={submitting}
          >
            Continue
          </Button>
        </div>
      )}

      {step === 'aadhaar' && (
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="text-xl font-semibold text-text-heading">
              Verify your Aadhaar
            </h1>
            <p className="mt-1 text-body-md text-text-body">
              We use DigiLocker (Government of India) to securely verify your
              Aadhaar. You&apos;ll be redirected to give consent.
            </p>
          </div>

          {dl === 'idle' && (
            <Button variant="primary" onClick={() => void startDigiLocker()}>
              <ShieldCheck size={16} /> Verify with DigiLocker
            </Button>
          )}

          {dl === 'initializing' && (
            <div className="flex items-center gap-2 text-body-md text-text-body">
              <Loader2 className="size-4 animate-spin" /> Starting DigiLocker…
            </div>
          )}

          {dl === 'awaiting' && (
            <div className="flex flex-col gap-3 rounded-xl border border-border-default bg-neutral-100 p-4">
              <div className="flex items-center gap-2 text-body-md font-medium text-text-heading">
                <Loader2 className="size-4 animate-spin text-primary" />
                Complete the consent in the DigiLocker tab…
              </div>
              <p className="text-body-sm text-text-body">
                This page will update automatically once you finish. If the tab
                didn&apos;t open, use the button below.
              </p>
              {dlUrl && (
                <a
                  href={dlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-1.5 text-body-sm font-medium text-text-link"
                >
                  <ExternalLink size={14} /> Reopen DigiLocker
                </a>
              )}
            </div>
          )}

          {dl === 'fetching' && (
            <div className="flex items-center gap-2 text-body-md text-text-body">
              <Loader2 className="size-4 animate-spin" /> Retrieving your Aadhaar…
            </div>
          )}

          {dl === 'failed' && (
            <div className="flex flex-col gap-3 rounded-xl border border-border-error bg-surface-error p-4">
              <div className="flex items-start gap-2 text-body-md font-medium text-text-error">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{dlError || 'Something went wrong.'}</span>
              </div>
              <Button variant="primary" onClick={() => void startDigiLocker()}>
                <ShieldCheck size={16} /> Retry with DigiLocker
              </Button>
            </div>
          )}
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="size-12 text-success" />
          <h1 className="text-xl font-semibold text-text-heading">
            Aadhaar verified — you&apos;re all set
          </h1>
          <p className="max-w-sm text-body-md text-text-body">
            Thanks, {info.candidateName.split(' ')[0]}. Your verification is
            complete. You can close this window.
          </p>
        </div>
      )}
          </div>
        </section>
      </div>

      {/* Decline confirmation. Plain fixed overlay + RDS Buttons — the same
          pattern the invoice panels use, since the RDS DialogBox's enter
          transition doesn't fire in this app (leaves the panel off-screen). */}
      {declineOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,26,59,0.45)] p-4"
          role="presentation"
          onClick={() => !submitting && setDeclineOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="decline-title"
            className="w-full max-w-[460px] rounded-xl border border-border-default bg-white p-6 shadow-[0px_8px_32px_rgba(11,26,59,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface-warning text-warning">
              <AlertTriangle size={20} />
            </span>
            <h2
              id="decline-title"
              className="text-lg font-semibold text-text-heading"
            >
              Decline this verification?
            </h2>
            <p className="mt-2 text-body-md text-text-body">
              The request will be closed and {info.clientName} will be notified.
              Nothing about you will be verified or stored. This cannot be
              undone.
            </p>
            {declineError && (
              <p className="mt-3 text-body-sm text-text-error">{declineError}</p>
            )}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => setDeclineOpen(false)}
                disabled={submitting}
              >
                Go back
              </Button>
              <Button
                variant="primary"
                onClick={() => void declineConsent()}
                isLoading={submitting}
                disabled={submitting}
              >
                Yes, decline
              </Button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({
  children,
  centered = false,
}: {
  children: React.ReactNode;
  /** Vertically centre the content — for terminal screens with no flow left. */
  centered?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-border-default bg-white">
        <div className="mx-auto flex max-w-[1040px] items-center gap-2.5 px-6 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="" width={28} height={28} />
          <span className="text-lg font-semibold text-text-heading">Assurio</span>
        </div>
      </header>
      <main
        className={
          centered
            ? 'mx-auto flex w-full max-w-[1040px] flex-1 items-center justify-center px-6 py-8'
            : 'mx-auto max-w-[1040px] px-6 py-8'
        }
      >
        {children}
      </main>
      <p className="pb-8 text-center text-body-sm text-text-placeholder">
        Secured by Assurio · Consent-first background checks
      </p>
    </div>
  );
}
