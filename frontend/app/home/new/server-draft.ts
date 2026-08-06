import { apiRequest } from '@/shared/http/api-client';
import type { CandidateDraft } from './draft';

/**
 * Server-persisted drafts of the Add-Candidate form. Each draft has its own id
 * (created when the form opens) so it can be listed under "Your Candidates" and
 * resumed later — persisted in the backend, not the browser.
 */
const PATH = '/v1/candidate-draft';

export interface DraftSummary {
  id: string;
  data: CandidateDraft;
  createdAt: string;
  updatedAt: string;
}

/** Create a new draft; returns its id. */
export async function createServerDraft(data: CandidateDraft): Promise<string> {
  const res = await apiRequest<{ id: string }>(PATH, {
    method: 'POST',
    body: { data },
  });
  return res.id;
}

/** All of the current user's in-progress drafts, newest first. */
export async function listServerDrafts(): Promise<DraftSummary[]> {
  const res = await apiRequest<{ drafts: DraftSummary[] }>(PATH);
  return res.drafts ?? [];
}

/** Load one draft's saved form state (for resume). */
export async function fetchServerDraft(
  id: string,
): Promise<CandidateDraft | null> {
  const res = await apiRequest<{ data: CandidateDraft | null }>(
    `${PATH}/${encodeURIComponent(id)}`,
  );
  return res.data ?? null;
}

export async function saveServerDraft(
  id: string,
  data: CandidateDraft,
): Promise<void> {
  await apiRequest<{ ok: true }>(`${PATH}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: { data },
  });
}

export async function deleteServerDraft(id: string): Promise<void> {
  await apiRequest<{ ok: true }>(`${PATH}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
