import type {
  VerificationFormConfig,
  VerificationFormResponse,
} from '@/modules/verification-checks/commons/verification-form.types';

export type CandidateCaseCheckStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED';

export type CandidateCaseCheckVerificationWorkflowStatus =
  | 'AWAITING_INPUT'
  | 'VENDOR_NOT_ASSIGNED'
  | 'IN_PROGRESS'
  | 'RAISE_INSUFFICIENCY'
  | 'COMPLETED'
  | 'COMPLETED_WITH_DISCREPANCY'
  | 'NOT_CONDUCTED'
  | 'FAILED_TO_VERIFY'
  | 'CLOSED_BY_CLIENT'
  | 'VERIFIED_BY_CLIENT';

export interface CandidateCaseCheckSummary {
  id: string;
  candidateCaseId: string;
  baseCheckId: string;
  checkDefinitionKey: string;
  checkName: string;
  checkIcon: string;
  quantity: number;
  allowAdditionalCharges: boolean;
  status: CandidateCaseCheckStatus;
  verificationWorkflowStatus: CandidateCaseCheckVerificationWorkflowStatus;
  currentInsufficiencyWhyFailed: string | null;
  currentInsufficiencyHowToFix: string | null;
  instanceInsufficiencies: Array<{
    instanceKey: string;
    instanceLabel: string;
    whyFailed: string | null;
    howToFix: string | null;
  }>;
  currentCompletionRemark: string | null;
  formComponentKey: string;
  formVersion: string;
  selectedSubitemIds: string[];
  selectedSubitems: Array<{
    id: string;
    definitionKey: string | null;
    name: string;
  }>;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
}

// Compact video-KYC state surfaced to the candidate's check detail.
// Only address checks ever have this populated; the field is always
// present on the wire (null for non-address) so the client doesn't
// have to special-case absence.
export interface CandidateCaseVideoKycCallSummary {
  id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED';
  createdAt: string;
  completedAt: string | null;
}

export interface CandidateCaseVideoKycReportSummary {
  id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED';
  verdict: 'VERIFIED' | 'REJECTED' | 'UNABLE_TO_VERIFY' | null;
  callId: string | null;
  createdAt: string;
  completedAt: string | null;
}

// Most recent scheduled appointment for the address check. Surfaced
// alongside the call/report so terminal cards (Verified / Rejected /
// Insufficiency) can render the original scheduled call window, which
// would otherwise be lost after the appointment flips to COMPLETED
// (where the active-only query returns null).
export interface CandidateCaseVideoKycAppointmentSummary {
  id: string;
  scheduledAt: string;
  endAt: string;
  durationMinutes: number;
  status: 'ASSIGNED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
}

export interface CandidateCaseVideoKycSummary {
  latestCall: CandidateCaseVideoKycCallSummary | null;
  latestReport: CandidateCaseVideoKycReportSummary | null;
  latestAppointment: CandidateCaseVideoKycAppointmentSummary | null;
}

// Shared pre-fill block for the Aadhaar-prefilled checks (criminal-check,
// credit-history, global-database). Aadhaar is mandatory in every package
// so `aadhaar` is populated once DigiLocker completes; PAN is populated
// when PAN is in the package AND the PAN vendor row is SUCCESS;
// `contactNumber` mirrors the candidate's Personal Information phone. Null
// for every check kind that isn't one of those three.
export interface CriminalCheckPrefill {
  aadhaarReady: boolean;
  aadhaar: {
    fullName: string | null;
    dob: string | null;
    fatherName: string | null;
    address: string | null;
  } | null;
  pan: {
    inPackage: boolean;
    panNumber: string | null;
  };
  // Pre-filled from CandidateCase.phoneNumber (Personal Information).
  contactNumber: string | null;
}

export interface CandidateCaseCheckDetail extends CandidateCaseCheckSummary {
  formConfig: VerificationFormConfig;
  response: VerificationFormResponse;
  // Null for every check type except address.
  videoKyc?: CandidateCaseVideoKycSummary | null;
  // Null for every check kind except the Aadhaar-prefilled checks
  // (criminal-check, credit-history, global-database).
  prefill?: CriminalCheckPrefill | null;
  // True when the case has an AADHAAR_V2 SUCCESS vendor row — i.e. the
  // candidate has completed DigiLocker at least once. Identity-step
  // navigation is gated on this. Always present on the wire (false for
  // cases without an identity check, true once DigiLocker succeeds);
  // optional on the type for backward-compat with older responses.
  digilockerCompleted?: boolean;
}

export interface CandidateCaseChecksResponse {
  caseChecks: CandidateCaseCheckSummary[];
}

export interface CandidateCaseCheckDetailResponse {
  caseCheck: CandidateCaseCheckDetail;
}
