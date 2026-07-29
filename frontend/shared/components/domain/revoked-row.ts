import type { VerificationCaseLifecycleStatus } from '@/shared/domain/verification-case-status';

/**
 * Tailwind class to apply to non-link data cells in any row that represents
 * a revoked verification case. Used by the verifications queue table and
 * the candidates table to keep the "greyed out" treatment consistent.
 */
export const REVOKED_CELL_CLASS = 'text-text-disabled';

export function isRevokedCase(
  caseStatus: VerificationCaseLifecycleStatus | null | undefined,
): boolean {
  return caseStatus === 'REVOKED';
}
