import { apiRequest } from '@/shared/http/api-client';
import { getCsrfTokenFromCookie } from '@/modules/auth/utils/csrf';
import type {
  ResolvedLayout,
  TableAudience,
} from '@/shared/commons/table-column-registry';

function buildPath(audience: TableAudience, tableKey: string): string {
  return `/v1/${audience}/ui/table-config/${encodeURIComponent(tableKey)}`;
}

function requireCsrf(): string {
  const token = getCsrfTokenFromCookie();
  if (!token) {
    throw new Error('Missing CSRF token');
  }
  return token;
}

export const tableConfigApi = {
  get: (audience: TableAudience, tableKey: string) =>
    apiRequest<ResolvedLayout>(buildPath(audience, tableKey)),

  update: (
    audience: TableAudience,
    tableKey: string,
    payload: { hiddenColumnKeys: string[]; columnOrder: string[] },
  ) =>
    apiRequest<ResolvedLayout>(buildPath(audience, tableKey), {
      method: 'PUT',
      body: payload,
      headers: { 'X-CSRF-Token': requireCsrf() },
    }),

  reset: (audience: TableAudience, tableKey: string) =>
    apiRequest<ResolvedLayout>(buildPath(audience, tableKey), {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': requireCsrf() },
    }),
};
