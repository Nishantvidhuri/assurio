import type { VerificationFormOption } from '@/modules/verification-checks/commons/verification-form.types';

export const CANDIDATE_PERSONAL_INFORMATION_GENDER_OPTIONS: VerificationFormOption[] = [
  { label: 'Male', value: 'Male' },
  { label: 'Female', value: 'Female' },
  { label: 'Other', value: 'Other' },
  { label: 'Prefer not to say', value: 'Prefer not to say' },
];

export const CANDIDATE_PERSONAL_INFORMATION_NATIONALITY_OPTIONS: VerificationFormOption[] = [
  { label: 'Indian', value: 'Indian' },
  { label: 'Other', value: 'Other' },
];
