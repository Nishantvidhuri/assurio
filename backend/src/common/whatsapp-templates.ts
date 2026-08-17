/**
 * Pure builders for the WhatsApp lifecycle notifications.
 *
 * The text lives here rather than inline in WhatsAppService so the admin
 * test page (/whatsapptest) can render exactly what will be delivered without
 * sending anything — one source of truth, no copy drift between preview and
 * the real message.
 *
 * House style: no emoji. These go to clients and candidates as formal notices
 * about their verification, so the tone stays plain and professional. Emphasis
 * comes from WhatsApp's own *bold* markup, never from decoration.
 */

export type CrimeRisk = 'high' | 'medium' | 'low';

const firstNameOf = (full: string): string => full.split(' ')[0] || full;

const SIGNOFF = '_The Assurio Team_';

/* ── To the CLIENT ─────────────────────────────────────────────────── */

export function reportReadyText(
  clientName: string,
  candidateName: string,
  reportUrl?: string,
): string {
  return (
    `Hi ${firstNameOf(clientName)},\n\n` +
    `The background verification report for *${candidateName}* is ready.\n\n` +
    (reportUrl
      ? `View and download it here:\n${reportUrl}\n\n`
      : `View and download it from your Assurio dashboard.\n\n`) +
    SIGNOFF
  );
}

const RISK_BANDS: Record<
  CrimeRisk,
  { label: string; heading: string; advice: string }
> = {
  high: {
    label: 'HIGH RISK',
    heading: '*Criminal records — high risk*',
    advice: 'We recommend reviewing the full report before proceeding.',
  },
  medium: {
    label: 'MEDIUM RISK',
    heading: '*Criminal records — review recommended*',
    advice: 'Please review the details before proceeding.',
  },
  low: {
    label: 'LOW RISK',
    heading: '*Criminal records — clear*',
    advice: 'No records of concern were found.',
  },
};

export function crimeRiskAlertText(
  clientName: string,
  candidateName: string,
  risk: CrimeRisk,
): string {
  const band = RISK_BANDS[risk];
  return (
    `${band.heading} — ${candidateName}\n\n` +
    `Hi ${firstNameOf(clientName)},\n\n` +
    `The criminal records check for *${candidateName}* came back *${band.label}*.\n\n` +
    `${band.advice} Full details are in your Assurio dashboard.\n\n` +
    SIGNOFF
  );
}

export function refundProcessedText(
  clientName: string,
  candidateName: string,
  amountRupees?: number,
): string {
  const amt =
    typeof amountRupees === 'number'
      ? `of *₹${amountRupees.toLocaleString('en-IN')}* `
      : '';
  return (
    `Hi ${firstNameOf(clientName)},\n\n` +
    `A refund ${amt}has been credited back to your Assurio wallet for *${candidateName}*'s verification.\n\n` +
    `This happens automatically when a candidate declines or the consent request expires — no checks were run, so no charge applies.\n\n` +
    SIGNOFF
  );
}

export function consentDeclinedToClientText(
  clientName: string,
  candidateName: string,
): string {
  return (
    `Hi ${firstNameOf(clientName)},\n\n` +
    `*${candidateName}* has *declined* the background verification consent.\n\n` +
    `The request is now closed and any hold has been refunded to your wallet. No checks were run.\n\n` +
    SIGNOFF
  );
}

export function consentAcceptedToClientText(
  clientName: string,
  candidateName: string,
): string {
  return (
    `Hi ${firstNameOf(clientName)},\n\n` +
    `*${candidateName}* has *accepted* the verification consent.\n\n` +
    `Their background checks are now underway. You will be notified as results come in.\n\n` +
    SIGNOFF
  );
}

export function draftReminderText(clientName: string): string {
  return (
    `Hi ${firstNameOf(clientName)},\n\n` +
    `You have a candidate verification *draft* that has been pending for a week.\n\n` +
    `Complete it from your Assurio dashboard to start the checks — otherwise it will be cleared soon.\n\n` +
    SIGNOFF
  );
}

/* ── To the CANDIDATE ──────────────────────────────────────────────── */

export function verificationRequestedText(
  candidateName: string,
  clientName: string,
  checks: string[],
  inviteUrl: string,
): string {
  const list =
    checks.length > 0
      ? checks.map((c) => `• ${c}`).join('\n')
      : '• Identity verification';
  return (
    `Hi ${firstNameOf(candidateName)},\n\n` +
    `*${clientName}* has requested a background verification for you via *Assurio*.\n\n` +
    `This will include:\n${list}\n\n` +
    `Please review and give your consent to begin — it takes less than 10 minutes:\n${inviteUrl}\n\n` +
    SIGNOFF
  );
}

export function verificationDeclinedToCandidateText(
  candidateName: string,
  clientName: string,
): string {
  return (
    `Hi ${firstNameOf(candidateName)},\n\n` +
    `You have *declined* the background verification requested by *${clientName}*.\n\n` +
    `*No verification will be carried out.* The request is now closed, no checks have been run, and none of your details were verified or stored.\n\n` +
    `If this was a mistake, please reach out to ${clientName} and ask them to send a new request.\n\n` +
    SIGNOFF
  );
}

export function verificationAcceptedToCandidateText(
  candidateName: string,
  clientName: string,
): string {
  return (
    `Hi ${firstNameOf(candidateName)},\n\n` +
    `Thank you — your background verification with *${clientName}* has started.\n\n` +
    `We will only use the details you provided for this verification. No further action is needed from you right now.\n\n` +
    SIGNOFF
  );
}
