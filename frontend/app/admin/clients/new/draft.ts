/**
 * Tiny sessionStorage-backed draft used to pass the Add-Client form
 * between routes: /admin/clients/new → /checkout → /success.
 */

export interface ClientDraft {
  name: string;
  email: string;
  phone: string;
  aadhaar: string;
  pan: string;
}

const KEY = 'assurio:client-draft';

export function saveDraft(draft: ClientDraft): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY, JSON.stringify(draft));
}

export function loadDraft(): ClientDraft | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ClientDraft;
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
