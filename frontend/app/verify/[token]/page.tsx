'use client';

/**
 * Public candidate verification flow — reached by an emailed link, no login.
 * Three steps: (1) consent to the Terms & Conditions, (2) confirm details
 * (name / mobile / email / Aadhaar number), (3) complete Aadhaar via DigiLocker
 * with live progress. Backed by the public /verify-link/:token endpoints.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ShieldCheck, ExternalLink, Loader2, AlertTriangle } from 'lucide-react';
import TermsBox from '../../components/TermsBox';
import LanguageSwitcher from '../../components/LanguageSwitcher';
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
  const t = useTranslations('verify');

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
        if (!cancelled) setLoadError(err instanceof Error ? err.message : t('aadhaar.invalidLink'));
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
      setDlError(err instanceof Error ? err.message : t('aadhaar.fetchError'));
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
            setDlError(s.errorDescription || t('aadhaar.failedError'));
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
        err instanceof Error ? err.message : t('decline.failed'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Aadhaar is only part of the flow when the client supplied one — the backend
  // plans the check accordingly, so drive the whole step off that rather than
  // asking every candidate for a number we will never use.
  const aadhaarRequired = (info?.checks ?? []).some((c) => c.key === 'aadhaar');

  async function saveDetails() {
    if (submitting) return;
    if (!name.trim()) return alert('Please enter your name.');
    // Only demand an Aadhaar number when this verification actually includes
    // the Aadhaar check — the field isn't even shown otherwise.
    if (aadhaarRequired && !/^\d{12}$/.test(aadhaar.replace(/\s+/g, ''))) {
      return alert('Please enter a valid 12-digit Aadhaar number.');
    }
    setSubmitting(true);
    try {
      await verifyLinkUpdate(token, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        ...(aadhaarRequired
          ? { aadhaarNumber: aadhaar.replace(/\s+/g, '') }
          : {}),
      });
      if (aadhaarRequired) {
        setStep('aadhaar');
        // Generate the DigiLocker link now (on submit), not before — then hand off.
        void startDigiLocker();
      } else {
        // No Aadhaar in this verification: details were the last thing we needed.
        setStep('done');
      }
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
      setDlError(err instanceof Error ? err.message : t('aadhaar.startError'));
      setDl('failed');
    }
  }

  /* ---------- render ---------- */

  const order: Step[] = aadhaarRequired
    ? ['consent', 'form', 'aadhaar', 'done']
    : ['consent', 'form', 'done'];
  const curIdx = order.indexOf(step);

  // Field validation for the details step.
  const aadhaarDigits = aadhaar.replace(/\D/g, '');
  const aadhaarValid = aadhaarDigits.length === 12;
  const emailValid = /.+@.+\..+/.test(email.trim());
  const phoneValid = phone.replace(/\D/g, '').length >= 10;
  const formValid =
    name.trim().length > 1 &&
    emailValid &&
    phoneValid &&
    (!aadhaarRequired || aadhaarValid);
  const stepStatus = (i: number): StepperStatus =>
    step === 'done' || i < curIdx
      ? 'completed'
      : i === curIdx
        ? 'ongoing'
        : 'not_started';
  const stepItems: StepperItem[] = [
    { id: 'consent', title: t('steps.consent'), status: stepStatus(0) },
    { id: 'form', title: t('steps.details'), status: stepStatus(1) },
    ...(aadhaarRequired
      ? [{ id: 'aadhaar', title: t('steps.aadhaar'), status: stepStatus(2) }]
      : []),
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
          <h1 className="text-xl font-semibold text-text-heading">{t('invalid.title')}</h1>
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
            {t('decline.doneTitle')}
          </h1>
          <p className="max-w-md text-body-md text-text-body">
            {t('decline.doneBody')}
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
          {t('pageTitle')}
        </h1>
        <p className="text-body-md text-text-subheading">
          {t('pageSubtitle')}
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
                  {t('consent.heading', { client: info.clientName })}
                </h1>
                <p className="mt-0.5 text-body-sm text-text-subheading">
                  {t('consent.body')}
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
                {t('consent.refuse')}
              </Button>
            </div>
          </div>
          {/* Exactly what the candidate is consenting to — server-derived from
              the details the client provided. Nothing runs until they agree. */}
          {info.checks && info.checks.length > 0 && (
            <div className="rounded-xl border border-border-default bg-neutral-100 p-4">
              <h2 className="text-body-md font-semibold text-text-heading">
                {t('consent.checksTitle')}
              </h2>
              <p className="mt-0.5 text-body-sm text-text-subheading">
                {t('consent.checksBody')}
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
            label={t('consent.agreeLabel', {
              name: info.candidateName,
              client: info.clientName,
            })}
          />
          <Button
            variant="primary"
            onClick={() => void acceptTerms()}
            disabled={!agreed || submitting}
            isLoading={submitting}
            className="h-12! w-full rounded-lg text-body-lg!"
          >
            {t('consent.agreeButton')}
          </Button>
        </div>
      )}

      {step === 'form' && (
        <div className="flex flex-col gap-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-h4 text-text-heading md:text-h4">
              {t('form.title')}
            </h2>
            <p className="text-body-sm text-text-subheading">
              {t('form.subtitle')}
            </p>
          </div>

          <div className="grid gap-x-5 gap-y-5 md:grid-cols-2">
            <InputFieldWrapper label={t('form.name')} required className="md:col-span-2">
              <Input
                value={name}
                placeholder={t('form.namePlaceholder')}
                onChange={(e) => setName(e.target.value)}
              />
            </InputFieldWrapper>

            <InputFieldWrapper label={t('form.email')} required>
              <Input
                type="email"
                value={email}
                placeholder={t('form.emailPlaceholder')}
                onChange={(e) => setEmail(e.target.value)}
              />
            </InputFieldWrapper>

            <InputFieldWrapper label={t('form.phone')} required>
              <PhoneInput
                defaultCountry="IN"
                value={phone}
                onChange={(next) => setPhone(String(next ?? ''))}
              />
            </InputFieldWrapper>

            {aadhaarRequired && (
            <InputFieldWrapper
              label={t('form.aadhaar')}
              required
              className="md:col-span-2"
              error={
                aadhaar.length > 0 && !aadhaarValid
                  ? t('form.aadhaarError', { count: aadhaarDigits.length })
                  : undefined
              }
            >
              <Input
                value={aadhaar}
                placeholder={t('form.aadhaarPlaceholder')}
                inputMode="numeric"
                maxLength={12}
                onChange={(e) =>
                  setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))
                }
              />
            </InputFieldWrapper>
            )}
          </div>

          <Button
            variant="primary"
            onClick={() => void saveDetails()}
            disabled={submitting || !formValid}
            isLoading={submitting}
          >
            {t('form.continue')}
          </Button>
        </div>
      )}

      {step === 'aadhaar' && (
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="text-xl font-semibold text-text-heading">
              {t('aadhaar.title')}
            </h1>
            <p className="mt-1 text-body-md text-text-body">
              {t('aadhaar.body')}
            </p>
          </div>

          {dl === 'idle' && (
            <Button variant="primary" onClick={() => void startDigiLocker()}>
              <ShieldCheck size={16} /> {t('aadhaar.start')}
            </Button>
          )}

          {dl === 'initializing' && (
            <div className="flex items-center gap-2 text-body-md text-text-body">
              <Loader2 className="size-4 animate-spin" /> {t('aadhaar.starting')}
            </div>
          )}

          {dl === 'awaiting' && (
            <div className="flex flex-col gap-3 rounded-xl border border-border-default bg-neutral-100 p-4">
              <div className="flex items-center gap-2 text-body-md font-medium text-text-heading">
                <Loader2 className="size-4 animate-spin text-primary" />
                {t('aadhaar.awaitingTitle')}
              </div>
              <p className="text-body-sm text-text-body">
                {t('aadhaar.awaitingBody')}
              </p>
              {dlUrl && (
                <a
                  href={dlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-1.5 text-body-sm font-medium text-text-link"
                >
                  <ExternalLink size={14} /> {t('aadhaar.reopen')}
                </a>
              )}
            </div>
          )}

          {dl === 'fetching' && (
            <div className="flex items-center gap-2 text-body-md text-text-body">
              <Loader2 className="size-4 animate-spin" /> {t('aadhaar.fetching')}
            </div>
          )}

          {dl === 'failed' && (
            <div className="flex flex-col gap-3 rounded-xl border border-border-error bg-surface-error p-4">
              <div className="flex items-start gap-2 text-body-md font-medium text-text-error">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{dlError || t('aadhaar.genericError')}</span>
              </div>
              <Button variant="primary" onClick={() => void startDigiLocker()}>
                <ShieldCheck size={16} /> {t('aadhaar.retry')}
              </Button>
            </div>
          )}
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="size-12 text-success" />
          <h1 className="text-xl font-semibold text-text-heading">
            {t('done.title')}
          </h1>
          <p className="max-w-sm text-body-md text-text-body">
            {t('done.body', { firstName: info.candidateName.split(' ')[0] })}
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
              {t('decline.title')}
            </h2>
            <p className="mt-2 text-body-md text-text-body">
              {t('decline.body', { client: info.clientName })}
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
                {t('decline.back')}
              </Button>
              <Button
                variant="primary"
                onClick={() => void declineConsent()}
                isLoading={submitting}
                disabled={submitting}
              >
                {t('decline.confirm')}
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
  const t = useTranslations('verify');
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-border-default bg-white">
        <div className="mx-auto flex max-w-[1040px] items-center gap-2.5 px-6 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="" width={28} height={28} />
          <span className="text-lg font-semibold text-text-heading">
            {t('brand')}
          </span>
          {/* The switcher lives in the header of every state — including the
              invalid-link and declined screens. Someone who cannot read the
              page needs it most exactly when something has gone wrong. */}
          <LanguageSwitcher className="ml-auto" />
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
        {t('footer')}
      </p>
    </div>
  );
}
