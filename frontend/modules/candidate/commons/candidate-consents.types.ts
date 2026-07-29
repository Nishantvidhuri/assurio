export type CandidateCaseConsentStatus = 'REQUIRED' | 'ACCEPTED';
export type CandidateCaseConsentSignatureMode = 'TYPED' | 'UPLOADED';
export type CandidateCaseConsentDocumentStatus =
  | 'PENDING'
  | 'GENERATING'
  | 'READY'
  | 'FAILED';

export interface CandidateConsentContentSnapshot {
  title: string;
  candidateName: string;
  organizationLegalName: string;
  privacyPolicyUrl: string;
  paragraphs: string[];
}

export interface CandidateCaseConsent {
  workspaceId: string;
  candidateCaseId: string;
  requiredConsentVersion: number;
  status: CandidateCaseConsentStatus;
  templateVersion: string;
  requiredSignerName: string;
  content: CandidateConsentContentSnapshot;
  signatureMode: CandidateCaseConsentSignatureMode | null;
  signerName: string | null;
  typedSignatureText: string | null;
  signatureDocumentId: string | null;
  acceptedAt: string | null;
  acceptedIpAddress: string | null;
  consentDocumentId: string | null;
  consentDocumentStatus: CandidateCaseConsentDocumentStatus | null;
  consentDocumentError: string | null;
}

export interface CandidateCaseConsentResponse {
  consent: CandidateCaseConsent;
}

export interface CreateConsentSignatureUploadIntentPayload {
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface CandidateConsentSignatureUploadIntent {
  uploadSessionId: string;
  documentId: string;
  documentVersionId: string;
  category: string;
  mode: string;
  uploadUrl?: string;
  expiresAt: string;
  key: string;
  requiredHeaders?: Record<string, string>;
}

export interface CandidateConsentSignatureUploadSession {
  id: string;
  tenantId: string;
  ownerType: 'CANDIDATE' | 'ORGANIZATION';
  candidateCaseId: string | null;
  documentId: string;
  documentVersionId: string;
  mode: 'SINGLE_PART' | 'MULTIPART';
  status: string;
  expectedMimeType: string;
  expectedSizeBytes: number;
  expiresAt: string;
  confirmedAt: string | null;
  createdAt: string;
  document: {
    id: string;
    ownerType: 'CANDIDATE' | 'ORGANIZATION';
    candidateCaseId: string | null;
    category: string;
    status: string;
    deletedAt: string | null;
    currentVersionNumber: number;
    createdAt: string;
    updatedAt: string;
    currentVersion: {
      id: string;
      versionNumber: number;
      originalFilename: string;
      storedFilename: string;
      mimeType: string;
      sizeBytes: number;
      scanStatus: string;
      uploadStatus: string;
      activatedAt: string | null;
    } | null;
  };
  documentVersion: {
    id: string;
    versionNumber: number;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    uploadStatus: string;
    scanStatus: string;
  };
}
