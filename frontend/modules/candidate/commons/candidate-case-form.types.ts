import type { CandidateCaseCheckDetail } from './candidate-case-checks.types';
import type { CandidateCaseConsent } from './candidate-consents.types';

export interface CandidateCaseFormDocumentSummary {
  documentId: string;
  documentVersionId: string | null;
  originalFilename: string;
  category: 'RESUME';
  mimeType: string | null;
}

export interface CandidateCasePersonalInformation {
  candidateCaseId: string;
  workspaceId: string;
  name: string;
  knownByOtherNames: boolean;
  formerName: string;
  primaryEmail: string;
  isPrimaryEmailVerified: boolean;
  phoneNumber: string;
  alternateEmail: string;
  alternatePhoneNumber: string;
  gender: string;
  nationality: string;
  dateOfBirth: string | null;
  addressLine1: string;
  addressLine2: string;
  country: string;
  state: string;
  district: string;
  city: string;
  pincode: string;
  uanNumber: string;
  resumeDocument: CandidateCaseFormDocumentSummary | null;
}

export interface CandidateCaseFormStep {
  id: string;
  sectionSlug: string;
  title: string;
  type:
    | 'PERSONAL_INFORMATION'
    | 'CHECK'
    | 'CONSENT_FORM'
    | 'REVIEW_AND_SUBMIT';
  candidateCaseCheckId?: string;
}

export type CandidateCaseCreationMode = 'CANDIDATE_INVITE' | 'CLIENT_FILLED';

export interface CandidateCaseFormDetail {
  candidateCaseId: string;
  workspaceId: string;
  status: 'DRAFT' | 'INVITED' | 'IN_PROGRESS' | 'COMPLETED';
  /** How the case was created — drives whether the candidate fills the
   * full form or just signs the consent. CLIENT_FILLED + no submitted-at
   * = "client filled everything; only consent is editable". */
  creationMode: CandidateCaseCreationMode;
  isReadOnly: boolean;
  candidateFormSubmittedAt: string | null;
  steps: CandidateCaseFormStep[];
  personalInformation: CandidateCasePersonalInformation;
  caseChecks: CandidateCaseCheckDetail[];
  consent: CandidateCaseConsent;
}

export interface CandidateCaseFormResponse {
  caseForm: CandidateCaseFormDetail;
}

export interface UpdateCandidateCasePersonalInformationPayload {
  name?: string;
  knownByOtherNames?: boolean;
  formerName?: string;
  phoneNumber?: string;
  alternateEmail?: string;
  alternatePhoneNumber?: string;
  gender?: string;
  nationality?: string;
  dateOfBirth?: string | null;
  addressLine1?: string;
  addressLine2?: string;
  country?: string;
  state?: string;
  district?: string;
  city?: string;
  pincode?: string;
  uanNumber?: string;
  resumeDocument?: CandidateCaseFormDocumentSummary | null;
}

export interface UpdateCandidateCasePersonalInformationResponse {
  personalInformation: CandidateCasePersonalInformation;
}
