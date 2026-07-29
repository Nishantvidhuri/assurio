export type CandidateDashboardSectionStatus =
  | 'AWAITING_INPUT'
  | 'VERIFICATION_IN_PROGRESS'
  | 'VERIFICATION_COMPLETED'
  | 'ACTION_REQUIRED';

export type CandidateDashboardSectionActionLabel =
  | 'Submit Details'
  | 'Continue Details'
  | 'View Details'
  | 'Review Document';

export interface CandidateDashboardSection {
  id: string;
  sectionSlug: string;
  type: 'PERSONAL_INFORMATION' | 'CHECK';
  title: string;
  status: CandidateDashboardSectionStatus;
  actionLabel: CandidateDashboardSectionActionLabel;
  /** True once the candidate has fully filled this section. */
  isComplete: boolean;
  candidateCaseCheckId?: string;
  checkDefinitionKey?: string | null;
  checkIcon?: string | null;
}

export interface CandidateWorkspaceDashboardDetail {
  candidateCaseId: string;
  workspaceId: string;
  isReadOnly: boolean;
  /**
   * Underlying case status. `INVITED` means the case has never moved
   * past the invite — but it can flip to IN_PROGRESS for reasons that
   * aren't the candidate's own input (e.g. client-filled drafts), so
   * prefer `hasStartedForm` below for Start vs Resume decisions.
   */
  caseStatus: string;
  /**
   * True once the candidate has saved any field themselves. Seeded
   * fields (name/email/phone from the invitation) don't flip this —
   * it's stamped server-side on the first PI autosave or check-draft
   * save, and only written once.
   */
  hasStartedForm: boolean;
  candidateFirstName: string;
  completedVerificationChecksCount: number;
  totalVerificationChecksCount: number;
  sections: CandidateDashboardSection[];
}

export interface CandidateWorkspaceDashboardResponse {
  dashboard: CandidateWorkspaceDashboardDetail;
}
