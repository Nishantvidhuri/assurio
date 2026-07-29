import type { CandidateCaseCheckVerificationWorkflowStatus } from '@/modules/candidate/commons/candidate-case-checks.types';
import type { TagProps } from '@/shared/components/ui';

/**
 * Derived verification-case-level status bucket used by the queue/candidates
 * tables. Keeping this purely presentational and shared across internal
 * verifications and client candidates surfaces guarantees the same row tag
 * for the same underlying case state.
 */
export type VerificationCaseStatusType =
  | 'draft'
  | 'pending'
  | 'progress'
  | 'insufficiency'
  | 'approve_charges'
  | 'completed'
  | 'revoked';

export interface VerificationCaseStatus {
  type: VerificationCaseStatusType;
  label: string;
}

export type VerificationCaseStatusAudience = 'internal' | 'client';

export type VerificationCaseLifecycleStatus =
  | 'DRAFT'
  | 'INVITED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REVOKED';

const COMPLETED_BUCKET_STATUSES: ReadonlySet<CandidateCaseCheckVerificationWorkflowStatus> =
  new Set<CandidateCaseCheckVerificationWorkflowStatus>([
    'COMPLETED',
    'COMPLETED_WITH_DISCREPANCY',
    'NOT_CONDUCTED',
    'FAILED_TO_VERIFY',
    'CLOSED_BY_CLIENT',
    'VERIFIED_BY_CLIENT',
  ]);

const CLIENT_TERMINAL_STATUSES: ReadonlySet<CandidateCaseCheckVerificationWorkflowStatus> =
  new Set<CandidateCaseCheckVerificationWorkflowStatus>([
    'CLOSED_BY_CLIENT',
    'VERIFIED_BY_CLIENT',
  ]);

// "Pending" is only "awaiting candidate input" now — a submitted check is
// immediately IN_PROGRESS (vendors are fixed), matching the server buckets.
const PENDING_WORKFLOW_STATUSES: ReadonlySet<CandidateCaseCheckVerificationWorkflowStatus> =
  new Set<CandidateCaseCheckVerificationWorkflowStatus>(['AWAITING_INPUT']);

export function isCompletedBucketStatus(
  status: CandidateCaseCheckVerificationWorkflowStatus,
): boolean {
  return COMPLETED_BUCKET_STATUSES.has(status);
}

export function isPendingWorkflowStatus(
  status: CandidateCaseCheckVerificationWorkflowStatus,
): boolean {
  return PENDING_WORKFLOW_STATUSES.has(status);
}

export function isClientTerminalStatus(
  status: CandidateCaseCheckVerificationWorkflowStatus,
): boolean {
  return CLIENT_TERMINAL_STATUSES.has(status);
}

export function computeVerificationCaseStatus({
  checkWorkflowStatuses,
  totalChecks,
  caseStatus,
  audience = 'internal',
  hasPendingChargeApproval = false,
}: {
  checkWorkflowStatuses: CandidateCaseCheckVerificationWorkflowStatus[];
  totalChecks: number;
  caseStatus?: VerificationCaseLifecycleStatus | null;
  audience?: VerificationCaseStatusAudience;
  hasPendingChargeApproval?: boolean;
}): VerificationCaseStatus {
  if (caseStatus === 'REVOKED') {
    return { type: 'revoked', label: 'Verification Revoked' };
  }

  if (caseStatus === 'DRAFT') {
    return { type: 'draft', label: 'Draft' };
  }

  // "On hold" states — an insufficiency wins over a pending charge approval.
  if (checkWorkflowStatuses.some((s) => s === 'RAISE_INSUFFICIENCY')) {
    return { type: 'insufficiency', label: 'Insufficiency' };
  }

  if (hasPendingChargeApproval) {
    return { type: 'approve_charges', label: 'Approve Charges' };
  }

  const isPendingForAudience = (
    status: CandidateCaseCheckVerificationWorkflowStatus,
  ) =>
    audience === 'client'
      ? status === 'AWAITING_INPUT'
      : isPendingWorkflowStatus(status);

  if (
    totalChecks === 0 ||
    checkWorkflowStatuses.every(isPendingForAudience)
  ) {
    return { type: 'pending', label: 'Pending' };
  }


  if (
    caseStatus === 'COMPLETED' &&
    totalChecks > 0 &&
    checkWorkflowStatuses.every(isCompletedBucketStatus)
  ) {
    return { type: 'completed', label: 'Completed' };
  }

  const progressCount = checkWorkflowStatuses.filter((s) =>
    isCompletedBucketStatus(s),
  ).length;

  return { type: 'progress', label: `${progressCount}/${totalChecks}` };
}

export function getVerificationStatusTagVariant(
  statusType: VerificationCaseStatusType,
): TagProps['variant'] {
  switch (statusType) {
    case 'insufficiency':
      return 'Failure';
    case 'approve_charges':
      return 'Warning';
    case 'draft':
      return 'Default';
    case 'completed':
      return 'Success';
    case 'progress':
    case 'pending':
      return 'Warning';
    case 'revoked':
    default:
      return 'Default';
  }
}
