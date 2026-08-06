/**
 * Single source of truth for "which verification checks can we run with the
 * data collected so far". Used by both the in-wizard Review step
 * (app/home/new/page.tsx) and the checkout Review & Pay page
 * (app/home/new/checkout/page.tsx) so the two never drift apart.
 *
 * Each check lists the draft fields it depends on — mirroring the backend
 * DTOs in backend/src/verify/dto.ts. A check runs only when every field it
 * requires is filled.
 */
import type { CandidateDraft } from './draft';

export type CheckFieldKey = keyof Omit<
  CandidateDraft,
  'idDocuments' | 'consentAcceptedAt'
>;

export const CHECK_FIELD_LABELS: Record<CheckFieldKey, string> = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  role: 'Role',
  gender: 'Gender',
  fatherName: "Father's name",
  permanentAddress: 'Permanent address',
  pincode: 'Pincode',
  aadhaar: 'Aadhaar number',
  pan: 'PAN',
  dob: 'Date of birth',
  drivingLicense: 'Driving licence',
  voterId: 'Voter ID',
  passportFileNo: 'Passport file number',
  uan: 'UAN',
};

export interface CheckDef {
  id: string;
  label: string;
  requires: CheckFieldKey[];
}

/**
 * Each check lists the fields it genuinely needs from the candidate (name is a
 * base field that's always present, so it isn't listed). The checkout's "what
 * we can perform" is derived from these, and the backend orchestrator runs each
 * check using the same rules — so what's shown is exactly what runs.
 */
export const CHECKS: CheckDef[] = [
  { id: 'pan', label: 'PAN verification', requires: ['pan'] },
  { id: 'aadhaar', label: 'Aadhaar (DigiLocker)', requires: ['aadhaar'] },
  {
    id: 'dl',
    label: 'Driving licence',
    requires: ['drivingLicense', 'dob'],
  },
  { id: 'voter', label: 'Voter ID', requires: ['voterId'] },
  { id: 'passport', label: 'Passport', requires: ['passportFileNo', 'dob'] },
  { id: 'employment', label: 'Employment history', requires: ['uan'] },
  {
    id: 'court',
    label: 'Crime / court record',
    requires: ['dob', 'permanentAddress'],
  },
  {
    id: 'credit',
    label: 'Credit check',
    requires: ['pan', 'dob', 'permanentAddress'],
  },
];

export interface PerformableCheck {
  id: string;
  label: string;
}

export interface BlockedCheck {
  id: string;
  label: string;
  missing: CheckFieldKey[];
}

/**
 * Turnaround for a check. Court-record (crime) and credit checks are pulled
 * from vendors that report within 24 hours; everything else is instant.
 */
export function checkEta(id: string): 'Instant' | '24h' {
  return id === 'court' || id === 'credit' ? '24h' : 'Instant';
}

export interface SplitChecks {
  performable: PerformableCheck[];
  blocked: BlockedCheck[];
}

/** Split the catalog into checks that can run vs. checks blocked by missing
 *  fields (with the specific fields still needed). */
export function splitChecks(draft: CandidateDraft): SplitChecks {
  const filled = (key: CheckFieldKey) => (draft[key] ?? '').trim().length > 0;
  const performable: PerformableCheck[] = [];
  const blocked: BlockedCheck[] = [];
  for (const check of CHECKS) {
    const missing = check.requires.filter((key) => !filled(key));
    if (missing.length === 0) {
      performable.push({ id: check.id, label: check.label });
    } else {
      blocked.push({ id: check.id, label: check.label, missing });
    }
  }
  return { performable, blocked };
}

/** Human-readable list of the fields a blocked check still needs. */
export function missingLabels(missing: CheckFieldKey[]): string {
  return missing.map((key) => CHECK_FIELD_LABELS[key]).join(', ');
}
