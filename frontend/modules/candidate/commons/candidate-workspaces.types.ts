export interface CandidateWorkspaceSummary {
  workspaceId: string;
  organizationName: string;
  organizationSlug: string | null;
  organizationBrandName: string | null;
  brandLogoUrl: string | null;
  currentCaseId: string;
  currentCaseStatus: 'INVITED' | 'IN_PROGRESS' | 'COMPLETED';
  candidateName: string;
  candidateEmail: string | null;
  phoneNumber: string | null;
  position: string | null;
  completedStepsCount: number;
  totalStepsCount: number;
  lastEditedAt: string | null;
  createdAt: string;
  completedAt: string | null;
  inviteAcceptedAt: string | null;
}

export interface CandidateWorkspaceListResponse {
  workspaces: CandidateWorkspaceSummary[];
}
