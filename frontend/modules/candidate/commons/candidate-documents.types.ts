import type { VerificationDocumentCategory } from '@/modules/verification-checks/commons/verification-form.types';

export type CandidateDocumentCategory = VerificationDocumentCategory;

export interface CreateCandidateDocumentUploadIntentPayload {
  candidateCaseId: string;
  category: CandidateDocumentCategory;
  existingDocumentId?: string;
  createNewDocument?: boolean;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface CandidateDocumentUploadIntent {
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

export interface CandidateDocumentUploadResult {
  uploadSessionId: string;
  documentId: string;
  documentVersionId: string;
  originalFilename: string;
  category: CandidateDocumentCategory;
}

export interface CandidateDocumentDownloadResponse {
  documentId: string;
  documentVersionId: string;
  downloadUrl: string;
  expiresInSeconds: number;
  fileName: string;
  mimeType: string;
}
