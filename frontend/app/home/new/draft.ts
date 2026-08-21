/**
 * sessionStorage-backed draft for the client Add-Candidate flow.
 * Carries data across /home/new → /home/new/checkout → /home/new/success.
 */

/** A virus-scanned ID document already stored in S3 under a draft prefix. */
export interface IdDocument {
  key: string;
  name: string;
  contentType: string;
  size: number;
  url: string | null;
}

export interface CandidateDraft {
  name: string;
  email: string;
  phone: string;
  role: string;
  // Additional details (feed the Crime & Credit checks).
  gender: string;
  fatherName: string;
  permanentAddress: string;
  pincode: string;
  aadhaar: string;
  pan: string;
  dob: string;
  drivingLicense: string;
  voterId: string;
  passportFileNo: string;
  uan: string;
  idDocuments: IdDocument[];
  // ISO timestamp of when the requester attested candidate consent (T&C tick).
  // Empty until accepted; recorded per-candidate on the created Subject.
  consentAcceptedAt: string;
}

const KEY = 'recrify:candidate-draft';

export function saveDraft(draft: CandidateDraft): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY, JSON.stringify(draft));
}

export function loadDraft(): CandidateDraft | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CandidateDraft;
    // Older drafts predate idDocuments — normalise so consumers can rely on it.
    if (!Array.isArray(parsed.idDocuments)) parsed.idDocuments = [];
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(KEY);
}

export function maskAadhaar(input: string): string {
  const digits = input.replace(/\D/g, '');
  return 'XXXX XXXX ' + digits.slice(-4);
}
