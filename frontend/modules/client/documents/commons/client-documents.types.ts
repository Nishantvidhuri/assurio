export type DocumentCategory =
  | 'RESUME'
  | 'BRAND_LOGO'
  | 'AADHAAR'
  | 'PAN'
  | 'EDUCATION_CERTIFICATE'
  | 'ADDRESS_PROOF'
  | 'EXPERIENCE_PROOF'
  | 'CONSENT_SIGNATURE'
  | 'CONSENT_LETTER'
  | 'OTHER';

export interface CandidateDocumentVersion {
  id: string;
  versionNumber: number;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: string;
  uploadStatus: string;
  activatedAt: string | null;
}

export interface CandidateDocument {
  id: string;
  ownerType: 'CANDIDATE' | 'ORGANIZATION';
  candidateCaseId: string | null;
  category: DocumentCategory;
  status: string;
  deletedAt: string | null;
  currentVersionNumber: number;
  createdAt: string;
  updatedAt: string;
  currentVersion: CandidateDocumentVersion | null;
  // Identity documents only: whether the masked (client-viewable) copy is
  // ready. While false, preview/download return 409 "being prepared".
  maskedReady?: boolean;
}

export interface CandidateDocumentsResponse {
  candidateCaseId: string;
  documents: CandidateDocument[];
}

export interface CreateDocumentUploadIntentPayload {
  candidateCaseId?: string;
  category: DocumentCategory;
  /**
   * When set, attach a new version to this existing document instead of
   * creating a new one (used for re-uploading the same field).
   */
  existingDocumentId?: string;
  /**
   * When true, force-create a fresh document even if a document with the
   * same `(candidateCaseId, category)` already exists. Pair with omitted
   * `existingDocumentId` for the first upload of a sibling field that
   * shares a category (e.g. Aadhaar Front vs. Back).
   */
  createNewDocument?: boolean;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface DocumentUploadIntent {
  uploadSessionId: string;
  documentId: string;
  documentVersionId: string;
  category: DocumentCategory;
  mode: 'SINGLE_PART' | 'MULTIPART';
  expiresAt: string;
  key: string;
  uploadUrl?: string;
  multipartUploadId?: string;
  requiredHeaders?: Record<string, string>;
}

export interface DocumentMultipartPresignResponse {
  uploadSessionId: string;
  multipartUploadId: string;
  parts: Array<{
    partNumber: number;
    uploadUrl: string;
  }>;
}

export interface DocumentUploadSessionStatus {
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
  document: CandidateDocument;
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

export interface DocumentUploadResult {
  uploadSessionId: string;
  documentId: string;
  documentVersionId: string;
}

export interface DocumentDownloadResponse {
  documentId: string;
  documentVersionId: string;
  downloadUrl: string;
  expiresInSeconds: number;
  fileName: string;
  mimeType: string;
}
