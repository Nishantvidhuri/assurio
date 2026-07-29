import type { CandidateCaseCheckSummary } from './candidate-case-checks.types';

export interface CandidateCaseDetail {
  id: string;
  status: 'INVITED' | 'IN_PROGRESS' | 'COMPLETED';
  organizationId: string;
  organizationName: string;
  organizationSlug: string | null;
  organizationBrandName: string | null;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  position: string | null;
  department: string | null;
  employeeId: string | null;
  alternateEmail: string | null;
  alternatePhoneNumber: string | null;
  dateOfJoining: string | null;
  dateOfShortlisting: string | null;
  uanNumber: string | null;
  createdAt: string;
  completedAt: string | null;
  revokedAt: string | null;
  inviteAcceptedAt: string | null;
  isEmailVerified: boolean;
  caseChecks: CandidateCaseCheckSummary[];
}

export interface CandidateCaseDetailResponse {
  case: CandidateCaseDetail;
}
