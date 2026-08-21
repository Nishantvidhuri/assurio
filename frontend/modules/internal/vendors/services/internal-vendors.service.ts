import { fetchCsrf } from '@/app/lib/api';
import { getCsrfToken } from '@/app/lib/session';
import { internalVendorsApi } from '../apis/internal-vendors.api';
import type {
  UpdateVendorSettingsPayload,
  VendorCallDetail,
  VendorCode,
  VendorHealthResponse,
  VendorSettings,
} from '../commons/internal-vendors.types';

class InternalVendorsService {
  getVendorHealth(
    code: VendorCode,
    queryString: string,
  ): Promise<VendorHealthResponse> {
    return internalVendorsApi.getVendorHealth(code, queryString);
  }

  getCall(id: string): Promise<VendorCallDetail> {
    return internalVendorsApi.getCall(id);
  }

  async updateSettings(
    code: VendorCode,
    payload: UpdateVendorSettingsPayload,
  ): Promise<VendorSettings> {
    const csrfToken = await this.getCsrf();
    return internalVendorsApi.updateSettings(code, payload, csrfToken);
  }

  /**
   * Recrify CSRF: the double-submit token lives in the `as_csrf` cookie and is
   * (re)issued by GET /auth/csrf. Recriauth's authService/ra_csrf pair is
   * replaced here — the rest of this service is the original.
   */
  private async getCsrf(): Promise<string> {
    let token = getCsrfToken();
    if (!token) {
      await fetchCsrf();
      token = getCsrfToken();
    }
    if (!token) {
      throw new Error('Unable to initialize CSRF token');
    }
    return token;
  }
}

export const internalVendorsService = new InternalVendorsService();
