/**
 * sessionStorage-backed draft for the client Add-Candidate flow.
 * Carries data across /home/new → /home/new/checkout → /home/new/success.
 */

export interface CandidateDraft {
  name: string;
  email: string;
  phone: string;
  role: string;
  aadhaar: string;
  pan: string;
  dob: string;
  drivingLicense: string;
  voterId: string;
  passportFileNo: string;
  uan: string;
}

const KEY = 'assurio:candidate-draft';

export function saveDraft(draft: CandidateDraft): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY, JSON.stringify(draft));
}

export function loadDraft(): CandidateDraft | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CandidateDraft;
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
