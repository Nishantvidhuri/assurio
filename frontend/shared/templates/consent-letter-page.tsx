'use client';

import { Candidate, CandidateReminderDefaults } from '@/modules/client/candidates/commons/client-candidates.types';
import { forwardRef, useMemo } from 'react';
import { formatDateTimeIst } from '@/shared/utils/date-formatters';

function formatConsentId(candidateId: string): string {
  const clean = candidateId.replace(/-/g, '');
  let h = 2166136261;
  for (let i = 0; i < clean.length; i++) {
    h ^= clean.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return String((h >>> 0) % 10000000000).padStart(10, '0');
}


function headerBrandName(defaults: CandidateReminderDefaults): string {
  if (defaults.showBrandName && defaults.brandName) {
    return defaults.brandName;
  }
  return defaults.legalName;
}

function RecriAuthLogoHeader() {
  return (
    <div className="flex items-center gap-1.5">
      <svg
        width="22"
        height="24"
        viewBox="0 0 45 50"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M22.38 50C19.53 50 13.88 46.6 9.62 41.65C3.58 34.64 0 24.92 0 12.5C0 12 .15 11.51.43 11.1C.71 10.68 1.1 10.36 1.56 10.18C9.71 6.9 16.19 3.65 21 .42 21.41.15 21.89 0 22.38 0c.49 0 .97.15 1.38.42C28.57 3.65 35.06 6.91 43.2 10.18c.46.18.86.5 1.14.92.28.41.42.9.42 1.4 0 12.42-3.58 22.14-9.62 29.15C30.88 46.59 25.24 50 22.38 50Z"
          fill="url(#consent_pdf_shield)"
        />
        <path
          d="M15.52 29.9c-.5.54-1.29.5-1.63-.18L5.62 13.16c-.16-.31-.14-.67.04-.96.18-.3.5-.47.84-.47 6.71-.32 13.43 3.67 12.46 10.33-.44 2.97-1.54 5.8-3.44 7.84Z"
          fill="#b9b1f5"
        />
        <path
          d="M21.59 44.96c-4.63-7.34-4.32-15.47-1.28-21.57l.43-.85c3.33-6.63 10.11-10.82 17.52-10.82.35 0 .66.17.84.47.18.3.2.66.05.96 0 0-15.49 31.03-15.88 31.8-.35.7-1.23.71-1.68 0Z"
          fill="#eae7fc"
        />
        <defs>
          <linearGradient
            id="consent_pdf_shield"
            x1="1.15"
            y1="48.69"
            x2="48.27"
            y2="6.51"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#3e34ab" />
            <stop offset="1" stopColor="#7469ea" />
          </linearGradient>
        </defs>
      </svg>
      <span className="text-[16px] tracking-tight text-text-link">
        Recri<span className="font-bold">Auth</span>
      </span>
    </div>
  );
}

function WatermarkShield() {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.05]"
      aria-hidden
    >
      <svg width="140" height="156" viewBox="0 0 45 50" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M22.38 50C19.53 50 13.88 46.6 9.62 41.65C3.58 34.64 0 24.92 0 12.5C0 12 .15 11.51.43 11.1C.71 10.68 1.1 10.36 1.56 10.18C9.71 6.9 16.19 3.65 21 .42 21.41.15 21.89 0 22.38 0c.49 0 .97.15 1.38.42C28.57 3.65 35.06 6.91 43.2 10.18c.46.18.86.5 1.14.92.28.41.42.9.42 1.4 0 12.42-3.58 22.14-9.62 29.15C30.88 46.59 25.24 50 22.38 50Z"
          fill="url(#consent_wm_shield)"
        />
        <path
          d="M15.52 29.9c-.5.54-1.29.5-1.63-.18L5.62 13.16c-.16-.31-.14-.67.04-.96.18-.3.5-.47.84-.47 6.71-.32 13.43 3.67 12.46 10.33-.44 2.97-1.54 5.8-3.44 7.84Z"
          fill="#b9b1f5"
        />
        <path
          d="M21.59 44.96c-4.63-7.34-4.32-15.47-1.28-21.57l.43-.85c3.33-6.63 10.11-10.82 17.52-10.82.35 0 .66.17.84.47.18.3.2.66.05.96 0 0-15.49 31.03-15.88 31.8-.35.7-1.23.71-1.68 0Z"
          fill="#eae7fc"
        />
        <defs>
          <linearGradient
            id="consent_wm_shield"
            x1="1.15"
            y1="48.69"
            x2="48.27"
            y2="6.51"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#3e34ab" />
            <stop offset="1" stopColor="#7469ea" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export interface ConsentLetterPdfPageProps {
  candidate: Candidate;
  reminderDefaults: CandidateReminderDefaults;
}


export const ConsentLetterPdfPage = forwardRef<HTMLDivElement, ConsentLetterPdfPageProps>(
  function ConsentLetterPdfPage({ candidate, reminderDefaults }, ref) {
    const brandHeader = headerBrandName(reminderDefaults);
    const authorizeName = reminderDefaults.legalName;
    const consentId = useMemo(() => formatConsentId(candidate.id), [candidate.id]);
    const consentWhen = useMemo(() => formatDateTimeIst(new Date()), []);
    const place = candidate.department?.trim() || '—';
    const candidateName = candidate.name.trim();

    return (
      <div
        ref={ref}
        className="box-border bg-white text-neutral-900 font-medium"
        style={{
          width: 595,
          height: 842,
          overflow: 'hidden',
          boxSizing: 'border-box',
          padding: '40px 44px 36px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div className="relative h-full w-full">
          <WatermarkShield />

          <div className="relative z-10 flex h-full w-full flex-col">
            <div className="flex shrink-0 items-start justify-between gap-6">
              <p className="max-w-[55%] text-[15px] font-bold leading-tight text-neutral-900">
                {brandHeader}
              </p>
              <RecriAuthLogoHeader />
            </div>

            <h1 className="mt-4 shrink-0 text-center text-[15px] font-bold uppercase tracking-[0.12em] text-neutral-900">
              Letter of consent
            </h1>

            <div className="mt-4 flex min-h-0 flex-1 flex-col justify-between">
              <div className="space-y-2 text-[11px] leading-[1.42] text-neutral-900">
              <p>
                I, {candidateName}, hereby authorize {authorizeName} and its background verification
                platform RecriAuth, including its partners, agents, contractors, or subcontractors
                (collectively referred to as the &ldquo;Company&rdquo;), to conduct background
                verification checks in relation to my application for employment.
              </p>
              <p>
                I understand that the background verification process may include verification of my
                educational qualifications (authentication of completed or ongoing degrees/diplomas),
                employment history, court records including criminal verification (as permitted by law),
                Permanent Account Number (PAN) verification, address verification, and any other checks
                deemed necessary by the Company.
              </p>
              <p>
                I further acknowledge and agree that such verification reports may be obtained before or
                during my employment, and may be conducted more than once if required. I provide my
                consent to the Company to process any sensitive personal information required for the
                purpose of verification and to contact me if any additional information or clarification
                is needed.
              </p>
              <p>
                I hereby authorize all previous employers, educational institutions, consumer reporting
                agencies, and other relevant entities to disclose any necessary information about me to the
                Company or to any third party authorized by the Company for the purpose of completing the
                background verification process.
              </p>
              <p>
                I understand that the continuation or offer of employment may be subject to the outcome
                of the background verification process conducted by the Company.
              </p>
              <p>
                I confirm that all information provided by me in the Background Verification Form is true
                and accurate to the best of my knowledge. I also agree that a photocopy, scanned copy, or
                digitally signed version of this consent shall be considered legally valid and equivalent
                to the original document.
              </p>
              </div>

              <div className="mt-6 flex shrink-0 items-end justify-between gap-8 border-t border-neutral-300 pt-5">
              <div className="min-w-0 space-y-1 text-[10px] leading-snug text-neutral-900">
                <p>
                  <span className="font-semibold">Candidate Name:</span> {candidateName}
                </p>
                <p>
                  <span className="font-semibold">Consent ID:</span> {consentId}
                </p>
                <p>
                  <span className="font-semibold">IP Address:</span> —
                </p>
                <p>
                  <span className="font-semibold">Date:</span> {consentWhen}
                </p>
                <p>
                  <span className="font-semibold">Place:</span> {place}
                </p>
              </div>

              <div className="shrink-0 flex w-[220px] flex-col items-center">
                <p className="mb-1 w-full text-center text-[10px] font-semibold text-neutral-900">
                  Signature:
                </p>
                <div className="flex w-full flex-col items-center">
                  <p
                    className="mb-2 max-w-full text-center text-[22px] leading-snug text-text-link"
                    style={{ fontFamily: "'Meow Script', cursive" }}
                  >
                    {candidateName}
                  </p>
                  <div className="h-px w-full bg-neutral-800" />
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
