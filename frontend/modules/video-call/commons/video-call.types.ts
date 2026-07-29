// Common Video-KYC types shared between the candidate-side flow and the
// internal-verifier flow. Mirrors the server's video-call.service shapes
// — keep these aligned with VideoCallService.StartVideoKycResult and
// VideoCallEventsService payloads.

export interface VideoKycCallStartResult {
  callId: string;
  roomName: string;
  livekitUrl: string;
  token: string;
}

// SSE: VIDEO_CALL_INCOMING — fanned out when a candidate clicks Start.
// Verifier dashboards render an incoming-call card from this.
export interface VideoCallIncomingPayload {
  callId: string;
  candidateCaseId: string;
  candidateCaseCheckId: string;
  candidateName: string;
  caseReference: string | null;
  addressSummary: string;
  startedAt: string;
}

// SSE: VIDEO_CALL_ACCEPTED / VIDEO_CALL_CANCELLED — fanned out so other
// verifier tabs fade their incoming-call card when the race is over.
export interface VideoCallResolvedPayload {
  callId: string;
  resolvedAt: string;
}

// Verdict-submit payload (verifier → server). Phase 2 sends verdict +
// security checks; Phase 4 will fill in location / screenshots /
// locationTrajectory with real GPS data. Until then the verifier
// submits empty arrays for those.
export type VideoKycVerdict = 'verified' | 'rejected' | 'unable_to_verify';
export type SecurityCheckOutcome = 'pass' | 'fail' | 'not_answered';

export interface SecurityCheckResult {
  id: string;
  prompt: string;
  verdict: SecurityCheckOutcome;
  remark?: string;
}

export interface VideoKycParsedAddress {
  flatBuilding: string | null;
  areaLocality: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
}

export interface VideoKycLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  addressFormatted?: string;
  // Per-field reverse-geocode breakdown the candidate-report renderer
  // uses to populate Data Found for address fields. Produced from the
  // same Nominatim call that produces addressFormatted — one network
  // hit per call, no second round-trip server-side.
  parsedAddress?: VideoKycParsedAddress;
}

export interface VideoKycLocationSample extends VideoKycLocation {
  recordedAt: string;
}

export interface VideoKycScreenshot {
  slotId: string;
  slotTitle: string;
  documentId: string;
  capturedAt: string;
  location?: VideoKycLocation;
}

export interface SubmitVideoKycReportPayload {
  callId: string;
  verdict: VideoKycVerdict;
  securityChecks: SecurityCheckResult[];
  location?: VideoKycLocation;
  screenshots: VideoKycScreenshot[];
  locationTrajectory: VideoKycLocationSample[];
  startedAt: string;
  endedAt: string;
  durationSeconds?: number;
  notes?: string;
  personSpokenTo?: string;
  // When verdict is rejected (discrepancy) or unable_to_verify
  // (insufficiency), both required — the server persists them onto
  // CandidateCaseCheckVerificationWorkflow.currentInsufficiency* so the
  // candidate sees them in their check view. Omit for `verified`.
  insufficiencyWhyFailed?: string;
  insufficiencyHowToFix?: string;
  // Verifier's answer to "did the candidate confirm their stated stay
  // duration?". Flows into the candidate report's Data Found column for
  // the `address.stayDuration` row (echoes declared value when true,
  // "Not Matched" when false / undefined).
  stayDurationConfirmed?: boolean;
}

export interface SubmitVideoKycReportResult {
  reportId: string;
  verdict: 'VERIFIED' | 'REJECTED' | 'UNABLE_TO_VERIFY';
}
