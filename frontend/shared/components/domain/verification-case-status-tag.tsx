'use client';

import { Tag } from '@/shared/components/ui';
import type { CandidateCaseCheckVerificationWorkflowStatus } from '@/modules/candidate/commons/candidate-case-checks.types';
import {
  computeVerificationCaseStatus,
  getVerificationStatusTagVariant,
  type VerificationCaseStatusAudience,
  type VerificationCaseLifecycleStatus,
} from '@/shared/domain/verification-case-status';

interface VerificationCaseStatusTagProps {
  checkWorkflowStatuses: CandidateCaseCheckVerificationWorkflowStatus[];
  totalChecks: number;
  caseStatus?: VerificationCaseLifecycleStatus | null;
  audience?: VerificationCaseStatusAudience;
  hasPendingChargeApproval?: boolean;
}

/**
 * Single source of truth for rendering the case-level status chip in the
 * verifications queue and the candidates tables. All variant / label logic
 * lives in `verification-case-status.ts`.
 */
export function VerificationCaseStatusTag({
  checkWorkflowStatuses,
  totalChecks,
  caseStatus,
  audience = 'internal',
  hasPendingChargeApproval = false,
}: VerificationCaseStatusTagProps) {
  const status = computeVerificationCaseStatus({
    checkWorkflowStatuses,
    totalChecks,
    caseStatus,
    audience,
    hasPendingChargeApproval,
  });
  return (
    <Tag
      variant={getVerificationStatusTagVariant(status.type)}
      label={status.label}
    />
  );
}
