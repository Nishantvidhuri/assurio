import type {
  CandidateCaseCheckStatus,
  CandidateCaseCheckVerificationWorkflowStatus,
} from '@/modules/candidate/commons/candidate-case-checks.types';
import type {
  VerificationFormConfig,
  VerificationFormResponse,
} from '@/modules/verification-checks/commons/verification-form.types';
import type { TatInstanceSummary, TatSummary } from '@/shared/domain/tat';

export interface InternalVerificationLinkedDocument {
  documentId: string;
  documentVersionId: string | null;
  originalFilename: string;
  category: string;
}

export interface InternalVerificationAdditionalChargeDocument {
  documentId: string;
  originalFilename: string;
  mimeType: string;
}

export interface InternalVerificationAdditionalChargeRequestSummary {
  id: string;
  candidateCaseCheckId: string | null;
  checkInstanceKey: string;
  checkInstanceLabel: string;
  requestedByDisplayName: string;
  amount: string;
  currencyCode: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_REJECTED';
  requestedAt: string;
  decidedAt: string | null;
  billingTransactionId: string | null;
  // Optional proof PDF the reviewer attached when raising the charge.
  document: InternalVerificationAdditionalChargeDocument | null;
}

// Reviewer-uploaded proof from the institute / employer for one
// education/employment instance — shown as "Verified Documents" in the
// queue and as clickable links in the verification report.
export interface InternalVerificationVerifiedDocument {
  id: string;
  documentId: string;
  displayName: string;
  mimeType: string | null;
  uploadedAt: string;
}

export interface InternalVerificationCheckInstanceDetail {
  instanceKey: string;
  instanceLabel: string;
  requestedByDisplayName: string | null;
  linkedDocuments: InternalVerificationLinkedDocument[];
  eligibleForAdditionalCharges: boolean;
  additionalChargeRequest: InternalVerificationAdditionalChargeRequestSummary | null;
  verifiedDocuments: InternalVerificationVerifiedDocument[];
}

export type InternalVerificationVendorName = 'SUREPASS' | 'KONNECTNXT';

export type InternalVerificationVendorType =
  | 'DIGILOCKER_INIT'
  | 'DIGILOCKER_STATUS'
  | 'AADHAAR_V2'
  | 'PAN_PAN'
  | 'VOTER_ID'
  | 'PASSPORT'
  | 'DRIVING_LICENSE'
  | 'AADHAAR_OCR_FRONT'
  | 'AADHAAR_OCR_BACK'
  | 'VOTER_OCR_FRONT'
  | 'VOTER_OCR_BACK'
  | 'PAN_OCR'
  | 'PASSPORT_OCR_FRONT'
  | 'PASSPORT_OCR_BACK'
  | 'DRIVING_LICENSE_OCR'
  | 'EMPLOYMENT_HISTORY'
  | 'CRIMINAL_CHECK'
  | 'CREDIT_REPORT_CHECK'
  | 'AML_CHECK'
  // UI-synthetic: the queue merges per-doc FRONT + BACK OCR rows into
  // a single OCR card. The server never emits these synthetic values.
  | 'AADHAAR_OCR'
  | 'VOTER_OCR'
  | 'PASSPORT_OCR';

export type InternalVerificationVendorStatus =
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED';

export interface InternalVerificationVendorDocument {
  documentId: string;
  documentVersionId: string;
  originalFilename: string;
  mimeType: string;
}

export interface InternalVerificationVendorRecord {
  id: string;
  vendor: InternalVerificationVendorName;
  verificationType: InternalVerificationVendorType;
  status: InternalVerificationVendorStatus;
  vendorClientId: string | null;
  extractedData: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  documentVersionId: string | null;
  document: InternalVerificationVendorDocument | null;
  // Populated by the client-side mergeOcrRows when a single virtual card
  // is built from two underlying rows (e.g. AADHAAR_OCR_FRONT +
  // AADHAAR_OCR_BACK). Server doesn't set this — the singular `document`
  // is authoritative for unmerged rows. Renderers should prefer
  // `documents` when present, falling back to `[document]` otherwise.
  documents?: InternalVerificationVendorDocument[];
  createdAt: string;
  completedAt: string | null;
}

// Video-KYC report — server-side projection of a VIDEO_KYC_REPORT
// DigitalVerification row. Only address checks ever have these.
export interface InternalVideoKycSecurityCheck {
  id: string;
  prompt: string;
  verdict: 'pass' | 'fail' | 'not_answered';
  remark?: string;
}

export interface InternalVideoKycLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  addressFormatted?: string;
  // Server-resolved declared address coords. Same pincode-only Nominatim
  // lookup the verifier panel uses during the call, so the queue's map
  // and the printed PDF pin the SAME spot the verifier saw. Null when
  // no pincode is filled or the geocode failed.
  declaredLatitude?: number | null;
  declaredLongitude?: number | null;
  // Composed declared address ("building, locality, city, district,
  // state, pincode, country") — server-built from the form values.
  // Surfaced verbatim in the queue's "Address Provided by candidate"
  // card so it matches the verifier panel's text exactly.
  declaredAddress?: string | null;
}

export interface InternalVideoKycScreenshot {
  slotId: string;
  slotTitle: string;
  documentId: string;
  capturedAt: string;
  location?: InternalVideoKycLocation;
}

export type InternalVideoKycAuthenticityLabel =
  | 'clean'
  | 'soft-flag'
  | 'hard-flag'
  | 'no_samples';

export interface InternalVideoKycAuthenticity {
  score: number;
  label: InternalVideoKycAuthenticityLabel;
  signals: string[];
  metrics: {
    sampleCount: number;
    maxDisplacementMeters: number;
    latitudeVarianceMeters: number;
    longitudeVarianceMeters: number;
    accuracySpreadMeters: number;
  };
}

// LiveKit Egress recording attached to the CALL row underlying this
// report. Null when recording was disabled at call time or no row
// exists. status drives the UI:
//   STARTING / ACTIVE → "Recording in progress" pill, no play button
//   COMPLETED          → play button; URL fetched on click
//   FAILED             → "Recording unavailable" with errorMessage tooltip
export interface InternalVideoKycRecording {
  id: string;
  status: 'STARTING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
  durationSeconds: number | null;
  sizeBytes: number | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface InternalVideoKycReport {
  id: string;
  callId: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED';
  verdict: 'VERIFIED' | 'REJECTED' | 'UNABLE_TO_VERIFY' | null;
  verifier: { id: string; name: string } | null;
  recording: InternalVideoKycRecording | null;
  securityChecks: InternalVideoKycSecurityCheck[];
  location: InternalVideoKycLocation | null;
  screenshots: InternalVideoKycScreenshot[];
  authenticity: InternalVideoKycAuthenticity | null;
  notes: string | null;
  personSpokenTo: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  createdAt: string;
  completedAt: string | null;
}

// ── Employment "Data found" comparison (internal verifications only) ─────────

export type EmploymentDataFoundFieldKey =
  | 'employment.companyLegalName'
  | 'employment.employeeId'
  | 'employment.designation'
  | 'employment.dateOfJoining'
  | 'employment.lastWorkingDate'
  | 'employment.reasonForLeaving';

export type EmploymentDataFoundSource = 'OVERRIDE' | 'UAN' | 'NONE';

export interface EmploymentDataFoundField {
  value: string | null;
  source: EmploymentDataFoundSource;
  isOverridden: boolean;
}

export interface EmploymentUanRecord {
  employerName: string | null;
  memberId: string | null;
  employeeName: string | null;
  guardianName: string | null;
  dateOfJoining: string | null;
  dateOfExit: string | null;
  isCurrent: boolean;
}

export interface EmploymentComparisonInstance {
  instanceKey: string;
  instanceLabel: string;
  candidateValues: Record<EmploymentDataFoundFieldKey, string | null>;
  pairedUanRecord: EmploymentUanRecord | null;
  dataFound: Record<EmploymentDataFoundFieldKey, EmploymentDataFoundField>;
}

export interface InternalEmploymentComparison {
  instances: EmploymentComparisonInstance[];
  unmatchedUanEmployments: EmploymentUanRecord[];
  uanStatus: 'SUCCESS' | 'FAILED' | 'ABSENT';
  // Whether the case carries a valid 12-digit UAN — distinguishes "nothing
  // to look up" from "UAN given but the lookup never fired" when ABSENT.
  uanProvided: boolean;
}

// ── Education "Data found" comparison (no vendor source — starts empty) ───────

export type EducationDataFoundFieldKey =
  | 'education.courseType'
  | 'education.attendanceType'
  | 'education.universityBoard'
  | 'education.institutionName'
  | 'education.registrationNumber'
  | 'education.degree'
  | 'education.specialization'
  | 'education.startDate'
  | 'education.endDate';

export interface EducationDataFoundField {
  value: string | null;
  source: 'OVERRIDE' | 'NONE';
  isOverridden: boolean;
}

export interface EducationComparisonInstance {
  instanceKey: string;
  instanceLabel: string;
  candidateValues: Record<EducationDataFoundFieldKey, string | null>;
  dataFound: Record<EducationDataFoundFieldKey, EducationDataFoundField>;
}

export interface InternalEducationComparison {
  instances: EducationComparisonInstance[];
}

// Identity edits the Candidate-said (OCR) column. Field keys are the comparison
// row keys across the five identity sections; the instanceKey (section id)
// scopes them, so reused keys (fullName, dob, …) are fine.
export type IdentityDataFoundFieldKey =
  | 'aadhaarNumber'
  | 'careOf'
  | 'panNumber'
  | 'fullName'
  | 'dob'
  | 'gender'
  | 'address'
  | 'licenseNumber'
  | 'bloodGroup'
  | 'fatherOrHusbandName'
  | 'dateOfIssue'
  | 'fileNumber'
  | 'passportNumber'
  | 'epicNumber'
  | 'relativeName';

// Union of every editable field key, accepted by the shared save endpoint (the
// server validates against the owning check's allow-list).
export type DataFoundFieldKey =
  | EmploymentDataFoundFieldKey
  | EducationDataFoundFieldKey
  | IdentityDataFoundFieldKey;

export interface InternalVerificationCheckDetail {
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
  currentCompletionRemark: string | null;
  // Internal-team "RecriAuth comment" — one per check, shown in the report.
  recriauthComment: string | null;
  instanceStatuses: InternalVerificationInstanceStatus[];
  lastStatusChangedAt: string | null;
  lastStatusChangedBy: { id: string; name: string } | null;
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
  formConfig: VerificationFormConfig;
  response: VerificationFormResponse;
  linkedDocuments: InternalVerificationLinkedDocument[];
  instances: InternalVerificationCheckInstanceDetail[];
  // Only the internal verifications endpoint populates this; the client-side
  // profile endpoint omits it (client users see only the required details).
  // Optional so consumers can ignore it when not present.
  vendorVerifications?: InternalVerificationVendorRecord[];
  // Newest-first list of VIDEO_KYC_REPORT rows for this check. Only
  // address checks ever populate this — empty array on other checks.
  videoKycReports?: InternalVideoKycReport[];
  // Latest scheduled video-KYC appointment for this check. Drives the
  // "Candidate has booked a slot for …" callout on the address card.
  // Null when the candidate hasn't booked yet (or on non-address checks).
  latestVideoKycAppointment?: {
    scheduledAt: string;
    durationMinutes: number;
    status: 'ASSIGNED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | 'INCOMPLETE';
  } | null;
  // Per-employment comparison (candidate vs editable Data found). Only
  // employment checks populate this; null/absent for every other check type.
  employmentComparison?: InternalEmploymentComparison | null;
  // Per-qualification comparison for education checks (no vendor source — Data
  // found starts empty); null/absent for every other check type.
  educationComparison?: InternalEducationComparison | null;
  // Internal-team corrections to the Candidate-said (OCR) column on identity
  // checks, keyed sectionId → fieldKey → value. Layered over the OCR values by
  // the client-side identity comparison builders. Null/absent otherwise.
  identityCandidateSaidOverrides?: Record<
    string,
    Record<string, string>
  > | null;
  // Internal-team "Verification findings" for reference checks, keyed
  // optionKey → findings text. Null for non-reference checks.
  referenceFindings?: Record<string, string> | null;
  // Per-check turnaround time (drives the <TatBadge> on the check tab).
  // Null when the check's clock never started.
  tat: TatSummary | null;
  // One summary per instance that has any workflow history. Keyed by
  // instanceKey; the card looks its own key up. Empty for single-instance
  // or untouched checks.
  instanceTats?: TatInstanceSummary[];
}

export interface InternalVerificationCaseDetail {
  id: string;
  caseReference: string | null;
  status: 'INVITED' | 'IN_PROGRESS' | 'COMPLETED' | 'REVOKED';
  // Drives the "On Hold" / "Approve Charges" status badge in the header.
  hasPendingChargeApproval: boolean;
  // Case creation timestamp. "Date Initiated" in the UI reads from
  // this — it's stable (set once at insert, never mutated). Do NOT
  // use verificationQueueUpdatedAt for this label; that value bumps
  // on workflow transitions.
  createdAt: string;
  verificationQueueUpdatedAt: string;
  completedAt: string | null;
  revokedAt: string | null;
  candidate: {
    id: string;
    name: string;
    email: string;
    phoneNumber: string | null;
    alternatePhoneNumber: string | null;
    position: string | null;
    department: string | null;
    employeeId: string | null;
  };
  organization: {
    id: string;
    legalName: string;
    brandName: string | null;
  };
  // Queue assignee, mirroring the list view. Powers the assign/reassign
  // control in the case-detail header. Null when unassigned.
  assignedTo: { id: string; name: string } | null;
  packageName: string | null;
  // Whole-case turnaround time (the header badge / summary).
  tat: TatSummary | null;
  checks: InternalVerificationCheckDetail[];
}

export interface InternalVerificationCaseDetailResponse {
  case: InternalVerificationCaseDetail;
}

export interface InternalVerificationListQuery {
  cursor?: string | null;
  limit?: number;
  caseStatus?: Array<'IN_PROGRESS' | 'COMPLETED'>;
  workflowStatus?: CandidateCaseCheckVerificationWorkflowStatus[];
  checkDefinitionKey?: string[];
  search?: string;
}

export interface UpdateInternalVerificationWorkflowInput {
  status: CandidateCaseCheckVerificationWorkflowStatus;
  insufficiencyWhyFailed?: string;
  insufficiencyHowToFix?: string;
  completionRemark?: string;
}

export interface InternalVerificationInstanceStatus {
  instanceKey: string;
  status: CandidateCaseCheckVerificationWorkflowStatus;
  insufficiencyWhyFailed: string | null;
  insufficiencyHowToFix: string | null;
  insufficiencyRaisedAt: string | null;
  updatedAt: string;
}

export interface UpdateCheckInstanceStatusInput {
  status: CandidateCaseCheckVerificationWorkflowStatus;
  insufficiencyWhyFailed?: string;
  insufficiencyHowToFix?: string;
}

export interface CreateInternalVerificationAdditionalChargeInput {
  candidateCaseCheckId: string;
  checkInstanceKey: string;
  amount: number;
  // Optional proof PDF attached at raise time.
  file?: File | null;
}

export interface SaveDataFoundInput {
  instanceKey: string;
  // `baseline` is the effective value shown before the edit (e.g. the OCR
  // original for identity Candidate-said); the server uses it as the audit
  // previousValue when it has no vendor-derived default of its own.
  fields: Array<{
    fieldKey: DataFoundFieldKey;
    value: string | null;
    baseline?: string | null;
  }>;
}

export interface SaveReferenceFindingsInput {
  optionKey: string;
  findings: string | null;
}

// null clears the saved RecriAuth comment for the check.
export interface SaveCheckCommentInput {
  comment: string | null;
}

export interface VerificationQueueSsePayload {
  candidateCaseId: string;
  emittedAt: string;
}
