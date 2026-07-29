// Mirrors the server VerificationCallDto (voice-call.types.ts).

export type VoiceCallStatus =
  | 'PLACED'
  | 'RINGING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'NO_ANSWER'
  | 'BUSY'
  | 'FAILED'
  | 'CANCELLED';

export type VoiceCallOutcome =
  | 'REACHED_VERIFIED'
  | 'REACHED_DISCREPANCY'
  | 'UNREACHABLE'
  | 'WRONG_NUMBER'
  | 'OTHER'
  // Candidate-call outcomes (captured by CandidateCallSummaryModal).
  | 'ANSWERED'
  | 'NOT_ANSWERED'
  | 'INVALID_PHONE_NUMBER'
  | 'UNABLE_TO_CONNECT';

export type VoiceCallRecordingStatus =
  | 'PENDING'
  | 'AVAILABLE'
  | 'STORED'
  | 'FAILED';

export type VoiceCallTranscriptStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'
  | 'SKIPPED';

// Who ended the call — derived from our own control flow, not TeleCMI.
export type VoiceCallHangupBy = 'AGENT' | 'CONTACT';

export interface VerificationCallRecording {
  id: string;
  status: VoiceCallRecordingStatus;
  documentId: string | null;
  durationSeconds: number | null;
  // Async Gemini transcript of the recording. `transcriptText` is null until
  // transcriptStatus is READY.
  transcriptStatus: VoiceCallTranscriptStatus;
  transcriptText: string | null;
  transcriptLanguage: string | null;
  transcriptCompletedAt: string | null;
}

// One speaker-attributed utterance, fetched on demand for a READY transcript.
// `speaker` is the raw Gemini label ('agent' | 'contact' | null) — the UI maps
// it to the dialing agent's name / the person spoken to.
export interface TranscriptSegment {
  start: number;
  end: number;
  speaker: string | null;
  text: string;
}

export interface VerificationCall {
  id: string;
  candidateCaseId: string;
  candidateCaseCheckId: string;
  instanceKey: string | null;
  status: VoiceCallStatus;
  toNumber: string;
  callerId: string | null;
  outcome: VoiceCallOutcome | null;
  outcomeNotes: string | null;
  personSpokenTo: string | null;
  hangupReason: string | null;
  // Who ended the call — null for unanswered/system terminations.
  hangupBy: VoiceCallHangupBy | null;
  durationSeconds: number | null;
  // Total seconds the agent held the call.
  holdSeconds: number | null;
  agentUserId: string | null;
  // Display name of the ops user who placed the call (read path only).
  agentName: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  createdAt: string;
  recording: VerificationCallRecording | null;
}

export interface SoftphoneCredentials {
  agentId: string;
  password: string;
  sbcUri: string;
}

export interface PlaceVoiceCallInput {
  instanceKey?: string | null;
  toNumber: string;
  callerId?: string | null;
}

// A contact card for an instance — either a "known" contact derived from the
// candidate's submitted data (employment HR/Manager, reference referee) or a
// "new" contact seeded from a call to a number not in the submitted data.
export interface VerificationContact {
  id: string;
  name: string;
  // "HR" / "Manager" for employment, the referee's designation for reference.
  designation: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  source: 'known' | 'new';
}

// Extra context threaded through placeCall so the post-call Call Summary modal
// can show the contact card + prefill "Person spoken to" without re-fetching.
export interface PlaceVoiceCallContext {
  contact?: VerificationContact | null;
  instanceLabel?: string | null;
  // 'candidate' routes the post-call capture to CandidateCallSummaryModal
  // (reachability outcome + notes only — no name / person-spoken-to). Absent
  // for verification (employment / education / reference) calls, which use the
  // default CallSummaryModal.
  variant?: 'candidate';
}

// A call is "live" (occupies the panel, blocks a second dial) in these states.
export const LIVE_VOICE_CALL_STATUSES: VoiceCallStatus[] = [
  'PLACED',
  'RINGING',
  'IN_PROGRESS',
];

export function isLiveVoiceCall(status: VoiceCallStatus): boolean {
  return LIVE_VOICE_CALL_STATUSES.includes(status);
}

// Display a stored (digits-only) number in E.164 form.
export function formatDisplayPhone(raw: string): string {
  if (!raw) return raw;
  return raw.startsWith('+') ? raw : `+${raw}`;
}

export const VOICE_CALL_OUTCOME_OPTIONS: {
  value: VoiceCallOutcome;
  label: string;
}[] = [
  { value: 'REACHED_VERIFIED', label: 'Reached — details verified' },
  { value: 'REACHED_DISCREPANCY', label: 'Reached — discrepancy found' },
  { value: 'UNREACHABLE', label: 'Could not be reached' },
  { value: 'WRONG_NUMBER', label: 'Wrong / invalid number' },
  { value: 'OTHER', label: 'Other' },
];

// Outcomes for a direct call to the candidate. The candidate is a known
// person, so the modal captures reachability only (no name / person-spoken-to).
export const CANDIDATE_CALL_OUTCOME_OPTIONS: {
  value: VoiceCallOutcome;
  label: string;
}[] = [
  { value: 'ANSWERED', label: 'Answered' },
  { value: 'NOT_ANSWERED', label: 'Not answered' },
  { value: 'INVALID_PHONE_NUMBER', label: 'Invalid phone number' },
  { value: 'UNABLE_TO_CONNECT', label: 'Unable to connect' },
];

// Every outcome → display label, across both verification and candidate calls.
// Used by the Call Attempts history to render whichever outcome was recorded.
export const VOICE_CALL_OUTCOME_LABELS: Record<VoiceCallOutcome, string> =
  Object.fromEntries(
    [...VOICE_CALL_OUTCOME_OPTIONS, ...CANDIDATE_CALL_OUTCOME_OPTIONS].map(
      (option) => [option.value, option.label],
    ),
  ) as Record<VoiceCallOutcome, string>;

export const HANGUP_BY_LABELS: Record<VoiceCallHangupBy, string> = {
  AGENT: 'Agent',
  CONTACT: 'Contact',
};

export const VOICE_CALL_STATUS_LABELS: Record<VoiceCallStatus, string> = {
  PLACED: 'Calling…',
  RINGING: 'Ringing…',
  IN_PROGRESS: 'Connected',
  COMPLETED: 'Completed',
  NO_ANSWER: 'No answer',
  BUSY: 'Busy',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};
