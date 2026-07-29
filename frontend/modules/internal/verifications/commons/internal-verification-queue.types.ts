import type { CandidateCaseCheckVerificationWorkflowStatus } from '@/modules/candidate/commons/candidate-case-checks.types';

export type VerificationQueueTab = 'VERIFICATIONS' | 'PENDING';

export type VerificationQueueSortBy =
  | 'caseReference'
  | 'candidateName'
  | 'organizationName'
  | 'packageName'
  | 'createdAt'
  | 'tat';

export interface VerificationQueueListItem {
  id: string;
  caseReference: string | null;
  candidateName: string;
  caseStatus: 'INVITED' | 'IN_PROGRESS' | 'COMPLETED' | 'REVOKED';
  revokedAt: string | null;
  organizationId: string;
  organizationName: string;
  packageName: string;
  createdAt: string;
  totalChecks: number;
  checkWorkflowStatuses: CandidateCaseCheckVerificationWorkflowStatus[];
  // True when a charge-approval request is pending → drives the "On Hold" /
  // "Approve Charges" derived status badge.
  hasPendingChargeApproval: boolean;
  // Phase 2 fields. Null when the form hasn't been submitted yet (PENDING
  // tab cases): the TAT column hides, last-updated still renders.
  assignedTo: { id: string; name: string } | null;
  pendingCheckName: string | null;
  tatElapsedMs: number | null;
  tatBreached: boolean;
  tatOvershootMs: number;
  tatThresholdMs: number;
  // True when the case is in any active pause window (open insufficiency
  // on any check, or currently inside the Fri 19:00 → Mon 10:00 IST
  // weekend window). The live ticker freezes when true.
  tatPaused: boolean;
  // ISO of candidateFormSubmittedAt — when the TAT clock started. Null in
  // the PENDING tab. Exposed for diagnostics + tooltip so ops can verify
  // when the TAT clock actually began.
  tatStartedAt: string | null;
  lastUpdatedAt: string;
}

// Shape mirrors what /v1/internal/scheduling/verifiers returns — id + name
// only — so the queue assignee dropdown reuses that endpoint without a
// dedicated DTO.
export interface VerificationQueueAssignableEmployee {
  userId: string;
  name: string;
}

export interface VerificationQueueMetricsResponse {
  range: { from: string; to: string };
  comparison: { from: string; to: string };
  tatThresholdHours: number;
  cards: {
    active: { value: number; prior: number };
    pending: { value: number; prior: number };
    slaBreached: { value: number; prior: number };
    atRisk: { value: number; prior: number };
    insufficiency: { value: number; prior: number };
    doneToday: { value: number; prior: number };
    avgTatHours: { value: number; prior: number };
  };
}

export interface VerificationQueueListResponse {
  data: VerificationQueueListItem[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface VerificationQueueListQuery {
  tab?: VerificationQueueTab;
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: VerificationQueueSortBy;
  sortOrder?: 'asc' | 'desc';
  status?: string[];
  organizationId?: string[];
  packageName?: string[];
  // Assignee filter. `__unassigned__` is the sentinel for "no assignee".
  // Other values are User ids. Combined with OR on the server.
  assignedToUserId?: string[];
}

export interface VerificationQueueFilterOptionsResponse {
  organizations: Array<{ id: string; name: string }>;
  packages: string[];
}
