/**
 * Every lifecycle notification the platform sends, with realistic sample data —
 * powers the admin /whatsapptest page.
 *
 * Each scenario carries the finished message text, built by the same pure
 * builders the live notifications use. The test page previews `text` and the
 * send endpoint delivers that exact string, so what you review is byte-for-byte
 * what a real client or candidate receives.
 */
import * as T from './whatsapp-templates';

export interface WaScenario {
  id: string;
  /** Who receives this in production. */
  audience: 'client' | 'candidate';
  /** Short title for the test page. */
  label: string;
  /** The real-world trigger. */
  trigger: string;
  text: string;
}

const CLIENT = 'Nishant Vidhuri';
const CANDIDATE = 'Jay Verma';
const AMOUNT = 399;

const CHECKS = [
  'PAN verification',
  'Aadhaar (via DigiLocker)',
  'Driving licence verification',
  'Voter ID verification',
  'Passport verification',
  'Employment history (UAN)',
  'Court & criminal records',
  'Credit report',
];

function appBase(): string {
  return (
    process.env.PUBLIC_APP_URL ||
    process.env.APP_URL ||
    'https://recrify.in'
  ).replace(/\/$/, '');
}

/** The full catalog, in lifecycle order. */
export function waScenarios(): WaScenario[] {
  const base = appBase();
  return [
    // ── Candidate-facing ──────────────────────────────────────────
    {
      id: 'verification-requested',
      audience: 'candidate',
      label: 'Verification requested',
      trigger: 'A client starts a verification — invite + the list of checks.',
      text: T.verificationRequestedText(
        CANDIDATE,
        CLIENT,
        CHECKS,
        `${base}/verify/demo`,
      ),
    },
    {
      id: 'verification-accepted-candidate',
      audience: 'candidate',
      label: 'Consent accepted (to candidate)',
      trigger: 'Candidate accepts consent — verification has started.',
      text: T.verificationAcceptedToCandidateText(CANDIDATE, CLIENT),
    },
    {
      id: 'verification-declined-candidate',
      audience: 'candidate',
      label: 'Consent declined (to candidate)',
      trigger: 'Candidate declines — verification rejected, request closed.',
      text: T.verificationDeclinedToCandidateText(CANDIDATE, CLIENT),
    },

    // ── Client-facing ─────────────────────────────────────────────
    {
      id: 'consent-accepted-client',
      audience: 'client',
      label: 'Consent accepted (to client)',
      trigger: 'Candidate accepted the consent — checks are underway.',
      text: T.consentAcceptedToClientText(CLIENT, CANDIDATE),
    },
    {
      id: 'consent-declined-client',
      audience: 'client',
      label: 'Consent declined (to client)',
      trigger: 'Candidate declined the consent — hold refunded.',
      text: T.consentDeclinedToClientText(CLIENT, CANDIDATE),
    },
    {
      id: 'report-ready',
      audience: 'client',
      label: 'Report ready',
      trigger: "The candidate's full report is done.",
      text: T.reportReadyText(CLIENT, CANDIDATE, `${base}/report/demo`),
    },
    {
      id: 'crime-high',
      audience: 'client',
      label: 'Crime result — HIGH risk',
      trigger: 'Criminal records check returns a high-risk record.',
      text: T.crimeRiskAlertText(CLIENT, CANDIDATE, 'high'),
    },
    {
      id: 'crime-medium',
      audience: 'client',
      label: 'Crime result — MEDIUM risk',
      trigger: 'Criminal records check returns a medium-risk record.',
      text: T.crimeRiskAlertText(CLIENT, CANDIDATE, 'medium'),
    },
    {
      id: 'crime-low',
      audience: 'client',
      label: 'Crime result — LOW risk',
      trigger: 'Criminal records check comes back clear.',
      text: T.crimeRiskAlertText(CLIENT, CANDIDATE, 'low'),
    },
    {
      id: 'refund-processed',
      audience: 'client',
      label: 'Refund processed',
      trigger: 'Consent expired after a week (or was declined) — hold refunded.',
      text: T.refundProcessedText(CLIENT, CANDIDATE, AMOUNT),
    },
    {
      id: 'draft-reminder',
      audience: 'client',
      label: 'Draft reminder',
      trigger: 'A candidate draft has been pending for a week.',
      text: T.draftReminderText(CLIENT),
    },
  ];
}

export function waScenarioById(id: string): WaScenario | undefined {
  return waScenarios().find((s) => s.id === id);
}
