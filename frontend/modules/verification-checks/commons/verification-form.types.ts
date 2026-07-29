export type VerificationFormFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'date'
  | 'textarea'
  | 'image-upload'
  | 'document-upload'
  | 'select'
  | 'radio-group';

export type VerificationDocumentCategory =
  | 'RESUME'
  | 'AADHAAR'
  | 'PAN'
  | 'EDUCATION_CERTIFICATE'
  | 'EXPERIENCE_PROOF'
  | 'OTHER'
  | 'ADDRESS_PROOF';

export type VerificationFormSectionLayout =
  | 'default'
  | 'identity-document'
  | 'address-verification'
  | 'reference-check'
  | 'employment-verification'
  | 'education-verification'
  | 'criminal-check'
  | 'credit-history'
  | 'global-database';

export interface VerificationFormOption {
  label: string;
  value: string;
}

export interface VerificationFormUploadOptions {
  category: VerificationDocumentCategory;
  acceptedDocumentTypes?: string[];
  maxFileSizeMb?: number;
  side?: 'front' | 'back';
}

export interface VerificationFormFieldDefinition {
  key: string;
  label: string;
  type: VerificationFormFieldType;
  required: boolean;
  placeholder?: string;
  helperText?: string;
  upload?: VerificationFormUploadOptions;
  options?: VerificationFormOption[];
}

export interface VerificationFormSectionDefinition {
  id: string;
  title: string;
  description?: string;
  layout?: VerificationFormSectionLayout;
  fields: VerificationFormFieldDefinition[];
}

export interface EmploymentVerificationFormMeta {
  experienceLimitFallback: number;
  calloutSubtitle: string;
  addExperienceLabel: string;
  noFurtherDetailsLabel: string;
}

export interface EducationVerificationFormMeta {
  educationLimitFallback: number;
  calloutSubtitle: string;
  addEducationLabel: string;
  noFurtherDetailsLabel: string;
}

// Reference: one entry per selected option (Last / 2nd Last / …), each
// carrying the per-option count (multiplier). Drives the grouped, fixed-
// count "Reference 1/2/…" sub-forms in the candidate form.
export interface ReferenceVerificationFormMeta {
  maxTotal: number;
  groups: Array<{ optionKey: string; optionLabel: string; count: number }>;
}

export interface VerificationFormConfig {
  title: string;
  description?: string;
  sections: VerificationFormSectionDefinition[];
  meta?: {
    employment?: EmploymentVerificationFormMeta;
    education?: EducationVerificationFormMeta;
    reference?: ReferenceVerificationFormMeta;
  };
}

export interface VerificationUploadedDocumentValue {
  documentId: string;
  documentVersionId?: string | null;
  originalFilename: string;
  category: VerificationDocumentCategory;
}

export type VerificationFormFieldValue =
  | string
  | VerificationUploadedDocumentValue;

export interface EmploymentVerificationExperienceValue {
  id: string;
  values: Record<string, VerificationFormFieldValue>;
}

export interface EmploymentVerificationResponse {
  experiences: EmploymentVerificationExperienceValue[];
  noFurtherDetails: boolean;
}

export interface EducationVerificationQualificationValue {
  id: string;
  values: Record<string, VerificationFormFieldValue>;
}

export interface EducationVerificationResponse {
  qualifications: EducationVerificationQualificationValue[];
  noFurtherDetails: boolean;
}

export interface ReferenceVerificationItemValue {
  id: string;
  values: Record<string, VerificationFormFieldValue>;
}

export interface ReferenceVerificationGroupValue {
  optionKey: string;
  references: ReferenceVerificationItemValue[];
}

export interface ReferenceVerificationResponse {
  groups: ReferenceVerificationGroupValue[];
}

export type VerificationFormResponse =
  | Record<string, VerificationFormFieldValue>
  | EmploymentVerificationResponse
  | EducationVerificationResponse
  | ReferenceVerificationResponse;

export function isEmploymentVerificationResponse(
  value: VerificationFormResponse | Record<string, unknown> | null | undefined,
): value is EmploymentVerificationResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Array.isArray((value as { experiences?: unknown }).experiences);
}

export function isEducationVerificationResponse(
  value: VerificationFormResponse | Record<string, unknown> | null | undefined,
): value is EducationVerificationResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Array.isArray((value as { qualifications?: unknown }).qualifications);
}

export function isReferenceVerificationResponse(
  value: VerificationFormResponse | Record<string, unknown> | null | undefined,
): value is ReferenceVerificationResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Array.isArray((value as { groups?: unknown }).groups);
}

export function createEmptyReferenceVerificationResponse(): ReferenceVerificationResponse {
  return { groups: [] };
}

export function createEmptyEmploymentVerificationResponse(): EmploymentVerificationResponse {
  return {
    experiences: [],
    noFurtherDetails: false,
  };
}

export function createEmptyEducationVerificationResponse(): EducationVerificationResponse {
  return {
    qualifications: [],
    noFurtherDetails: false,
  };
}
