import type { CandidateCaseCheckVerificationWorkflowStatus } from '@/modules/candidate/commons/candidate-case-checks.types';
import type {
  CandidateCaseCreationMode,
  CandidateCaseFormDetail,
} from '@/modules/candidate/commons/candidate-case-form.types';
import type { BulkSelectionRequest } from '@/shared/commons/bulk-selection.types';

export interface Candidate {
  id: string;
  caseReference: string | null;
  candidateUserId: string;
  status: 'DRAFT' | 'INVITED' | 'IN_PROGRESS' | 'COMPLETED' | 'REVOKED';
  creationMode: CandidateCaseCreationMode;
  name: string;
  email: string;
  addedByUserId: string | null;
  addedByName: string | null;
  phoneNumber: string | null;
  department: string | null;
  isEmailVerified: boolean;
  createdAt: string;
  employeeId: string | null;
  alternateEmail: string | null;
  alternatePhoneNumber: string | null;
  position: string | null;
  dateOfJoining: string | null;
  dateOfShortlisting: string | null;
  uanNumber: string | null;
  candidateFormSubmittedAt: string | null;
  revokedAt: string | null;
  completedAt: string | null;
  totalChecks: number;
  checkWorkflowStatuses: CandidateCaseCheckVerificationWorkflowStatus[];
  // True when a charge-approval request is pending → drives the "On Hold" /
  // "Approve Charges" derived status badge.
  hasPendingChargeApproval: boolean;
  packageName: string | null;
}

// True once verification has started on at least one check — i.e. any check's
// workflow has moved out of AWAITING_INPUT. Form submission is the usual
// trigger (the first submit moves every check out of AWAITING_INPUT), but it
// is NOT the only one: a candidate can schedule a digital-address video
// verification before submitting, and a completed call flips that single check
// to COMPLETED. No later state returns a check to AWAITING_INPUT, so once any
// check has progressed the case is no longer client-revocable.
export function hasCandidateVerificationStarted(candidate: Candidate): boolean {
  return candidate.checkWorkflowStatuses.some(
    (status) => status !== 'AWAITING_INPUT',
  );
}

// DRAFT (not yet invited), REVOKED (already revoked) and COMPLETED (terminal)
// cases are never revocable, by anyone. Beyond that the rule is audience-aware
// and mirrors the server:
//   - client: revoke only while verification has not started on any check
//     (every check still AWAITING_INPUT). Note this is broader than "form not
//     submitted" — a completed digital-address video verification also starts
//     a check, so it blocks client revoke too.
//   - internal/operations: revoke an in-flight case (INVITED / IN_PROGRESS) at
//     any progress point, but NOT once it is COMPLETED.
export function canRevokeCandidate(
  candidate: Candidate,
  audience: 'client' | 'internal' = 'client',
): boolean {
  if (
    candidate.status === 'REVOKED' ||
    candidate.status === 'DRAFT' ||
    candidate.status === 'COMPLETED'
  ) {
    return false;
  }
  if (audience === 'internal') {
    return true;
  }
  return !hasCandidateVerificationStarted(candidate);
}

// Human-readable reason the revoke action is unavailable, or null when it is
// allowed. Mirrors canRevokeCandidate exactly so the disabled-button tooltip
// always matches the actual gate (and the server rejection message).
export function revokeDisabledReason(
  candidate: Candidate,
  audience: 'client' | 'internal' = 'client',
): string | null {
  if (canRevokeCandidate(candidate, audience)) {
    return null;
  }
  if (candidate.status === 'REVOKED') {
    return 'This candidate has already been revoked.';
  }
  if (candidate.status === 'DRAFT') {
    return 'Draft candidates cannot be revoked. Delete the draft instead.';
  }
  if (candidate.status === 'COMPLETED') {
    return 'This verification is already completed and can no longer be revoked.';
  }
  // Client viewer, verification has already started on at least one check
  // (form submitted, or a digital-address video verification completed).
  return 'Verification has already started, so this candidate can no longer be revoked.';
}

export interface CandidateListMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  selectableTotalItems: number;
  totalPages: number;
}

export interface CandidateListResponse {
  data: Candidate[];
  meta: CandidateListMeta;
}

export interface CandidateListFiltersResponse {
  packages: string[];
}

export interface CandidateListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?:
    | 'caseReference'
    | 'name'
    | 'email'
    | 'position'
    | 'dateOfJoining'
    | 'addedByName'
    | 'createdAt'
    | 'packageName';
  sortOrder?: 'asc' | 'desc';
  status?: string[];
  packageName?: string[];
}

export interface CandidateBulkFilters {
  search?: string;
  status?: string[];
  packageName?: string[];
}

export type CandidateBulkSelectionPayload =
  BulkSelectionRequest<CandidateBulkFilters>;

// Export honours the date-range chip on top of the shared bulk filters, so it
// carries its own filter shape distinct from the revoke payload above.
export interface CandidateExportFilters extends CandidateBulkFilters {
  dateFrom?: string;
  dateTo?: string;
}

export type CandidateExportSelectionPayload =
  BulkSelectionRequest<CandidateExportFilters>;

export interface BulkRevokeCandidateVerificationResult {
  revoked: string[];
  skipped: string[];
  revokedCount: number;
  skippedCount: number;
}

export interface CreateCandidatePayload {
  creationMode?: CandidateCaseCreationMode;
  name: string;
  email: string;
  phoneNumber: string;
  uanNumber: string;
  employeeId?: string;
  alternateEmail?: string;
  alternatePhoneNumber?: string;
  department?: string;
  position?: string;
  dateOfJoining?: string;
  dateOfShortlisting?: string;
  knownByOtherNames?: boolean;
  formerFirstName?: string;
  formerLastName?: string;
  gender?: string;
  nationality?: string;
  dateOfBirth?: string;
  addressLine1?: string;
  addressLine2?: string;
  country?: string;
  state?: string;
  district?: string;
  city?: string;
  pincode?: string;
  emailNote?: string;
  packageSelection: {
    organizationPackageId: string;
    customizedChecks?: Array<{
      checkId: string;
      selectedSubitemIds: string[];
    }>;
    addOnSelections?: Array<{
      checkId: string;
      quantity?: number;
      selectedSubitemIds?: string[];
      subitemQuantities?: Record<string, number>;
    }>;
    orGroupSelections?: Array<{
      orGroupId: string;
      chosenCheckId: string;
    }>;
  };
}

export interface ClientFilledDraftPackageSelection {
  organizationPackageId: string;
  customizedChecks: Array<{
    checkId: string;
    selectedSubitemIds: string[];
  }>;
  addOnSelections: Array<{
    checkId: string;
    quantity?: number;
    selectedSubitemIds?: string[];
    subitemQuantities?: Record<string, number>;
  }>;
  orGroupSelections?: Array<{
    orGroupId: string;
    chosenCheckId: string;
  }>;
}

export interface ClientFilledDraftPackageChangeEntry {
  candidateCaseCheckId: string;
  baseCheckId: string;
  checkName: string;
}

export interface ClientFilledDraftPackageChangeImpact {
  removedChecks: ClientFilledDraftPackageChangeEntry[];
  resetChecks: ClientFilledDraftPackageChangeEntry[];
}

export interface ClientFilledDraftResponse {
  draft: {
    candidateCaseId: string;
    packageSelection: ClientFilledDraftPackageSelection | null;
    caseForm: CandidateCaseFormDetail;
  };
}

export interface UpdateClientFilledDraftPackageSelectionPayload
  extends ClientFilledDraftPackageSelection {
  confirmRiskyChange?: boolean;
}

export interface UpdateClientFilledDraftPackageSelectionResponse {
  requiresConfirmation: boolean;
  impact: ClientFilledDraftPackageChangeImpact;
  draft?: ClientFilledDraftResponse['draft'];
}

export interface UpdateCandidatePayload {
  name?: string;
  email?: string;
  phoneNumber?: string;
  uanNumber?: string;
  employeeId?: string;
  alternateEmail?: string;
  alternatePhoneNumber?: string;
  department?: string;
  position?: string;
  dateOfJoining?: string;
  dateOfShortlisting?: string;
}

export interface CandidateReminderDefaults {
  legalName: string;
  brandName: string | null;
  brandLogoUrl: string | null;
  showCompanyLogo: boolean;
  showBrandName: boolean;
  hrNoteEnabled: boolean;
  useCustomHrNote: boolean;
  defaultHrNote: string;
  customHrNote: string | null;
  overdueNoteEnabled: boolean;
  useCustomOverdueNote: boolean;
  defaultOverdueNote: string;
  customOverdueNote: string | null;
}

export interface SendCandidateReminderPayload {
  hrNoteEnabled?: boolean;
  useCustomHrNote?: boolean;
  customHrNote?: string;
  overdueNoteEnabled?: boolean;
  useCustomOverdueNote?: boolean;
  customOverdueNote?: string;
}

export interface SendCandidateReminderResponse {
  queued: boolean;
}

export const BULK_CANDIDATE_CSV_COLUMNS = [
  'Name',
  'Email',
  'Phone Number',
  'Alternate Email',
  'Alternate Phone Number',
  'Employee Id',
  'UAN',
  'Department',
  'Position',
  'Resume Drive URL',
] as const;

export type BulkCandidateCsvColumn = (typeof BULK_CANDIDATE_CSV_COLUMNS)[number];

export const BULK_CANDIDATE_CSV_REQUIRED_COLUMNS = [
  'Name',
  'Email',
  'Phone Number',
] as const;

export type BulkCandidateCsvRequiredColumn =
  (typeof BULK_CANDIDATE_CSV_REQUIRED_COLUMNS)[number];

export interface BulkCandidateCsvRowIssue {
  rowNumber: number;
  missingColumns: BulkCandidateCsvRequiredColumn[];
  invalidColumns: BulkCandidateCsvRequiredColumn[];
  duplicateColumns: BulkCandidateCsvRequiredColumn[];
  conflictingColumns?: BulkCandidateCsvRequiredColumn[];
}

export interface BulkCandidateCsvValidationResult {
  isValid: boolean;
  missingColumns: BulkCandidateCsvColumn[];
  normalizedHeaders: string[];
  rowIssues: BulkCandidateCsvRowIssue[];
}

export interface BulkCandidateUploadStepState {
  file: File | null;
  validationError: string | null;
}

export interface BulkCandidatePackageSelection {
  organizationPackageId: string;
  draft: import('./candidate-package-selection').CandidatePackageDraft;
}

export interface BulkCandidateStagedRow {
  id: string;
  rowNumber: number;
  name: string;
  email: string;
  phoneNumber: string;
  alternateEmail: string | null;
  alternatePhoneNumber: string | null;
  employeeId: string | null;
  uanNumber: string;
  department: string | null;
  position: string | null;
  resumeDriveUrl: string | null;
  packageSelection: BulkCandidatePackageSelection | null;
}

export interface BulkCandidateCsvParseResult {
  rows: BulkCandidateStagedRow[];
  headers: string[];
}

export interface BulkCandidateFlowState {
  step: 1 | 2 | 3 | 4;
  fileName: string | null;
  csvText: string | null;
  headers: string[];
  stagedRows: BulkCandidateStagedRow[];
  activeImportId: string | null;
}

export const BULK_CANDIDATE_DEFAULT_ADDONS_LABEL = 'No Add-ons';

export interface CandidateImportFailedPreviewRow {
  id: string;
  rowNumber: number;
  email: string;
  status: string;
  errorMessage: string | null;
}

export interface DocumentBulkImportFailedPreviewRow {
  id: string;
  rowNumber: number;
  candidateEmail: string;
  status: string;
  errorMessage: string | null;
}

export interface BulkInviteCandidatesResponse {
  id: string;
  status: string;
  sourceFileName: string;
  totalRows: number;
  processedRows: number;
  successRows: number;
  failedRows: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  asyncJob: {
    id: string;
    status: string;
    progressPercent: number;
    statusMessage: string | null;
    errorMessage: string | null;
    nextRetryAt: string | null;
  };
  failedPreview: Array<{
    id: string;
    rowNumber: number;
    email: string;
    status: string;
    errorMessage: string | null;
  }>;
  documentBulkImport: {
    id: string;
    status: string;
    totalRows: number;
    processedRows: number;
    successRows: number;
    failedRows: number;
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    completedAt: string | null;
    asyncJob: {
      id: string;
      status: string;
      progressPercent: number;
      statusMessage: string | null;
      errorMessage: string | null;
      nextRetryAt: string | null;
    };
    failedPreview: DocumentBulkImportFailedPreviewRow[];
  } | null;
}
