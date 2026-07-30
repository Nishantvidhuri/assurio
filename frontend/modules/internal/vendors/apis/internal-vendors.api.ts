import { apiRequest } from '@/shared/http/api-client';
import type {
  UpdateVendorSettingsPayload,
  VendorCallDetail,
  VendorCallLogResponse,
  VendorCode,
  VendorDetailResponse,
  VendorHealthResponse,
  VendorOverviewResponse,
  VendorSettings,
} from '../commons/internal-vendors.types';

const BASE = '/v1/internal/vendors';

export const internalVendorsApi = {
  getOverview: (queryString: string) =>
    apiRequest<VendorOverviewResponse>(
      `${BASE}/overview${queryString ? `?${queryString}` : ''}`,
    ),

  getVendorDetail: (code: VendorCode, queryString: string) =>
    apiRequest<VendorDetailResponse>(
      `${BASE}/${code}${queryString ? `?${queryString}` : ''}`,
    ),

  getVendorHealth: (code: VendorCode, queryString: string) =>
    apiRequest<VendorHealthResponse>(
      `${BASE}/${code}/health${queryString ? `?${queryString}` : ''}`,
    ),

  listCalls: (queryString: string) =>
    apiRequest<VendorCallLogResponse>(
      `${BASE}/calls${queryString ? `?${queryString}` : ''}`,
    ),

  getCall: (id: string) =>
    apiRequest<VendorCallDetail>(`${BASE}/calls/${encodeURIComponent(id)}`),

  updateSettings: (
    code: VendorCode,
    payload: UpdateVendorSettingsPayload,
    csrfToken: string,
  ) =>
    apiRequest<VendorSettings>(`${BASE}/${code}/settings`, {
      method: 'PATCH',
      headers: { 'X-CSRF-Token': csrfToken },
      body: payload,
    }),
};
