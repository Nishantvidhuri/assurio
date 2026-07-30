import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { VendorName } from '../../generated/prisma/client';
import { KONNECT_NXT, SUREPASS } from '../common/vendors';
import { VendorCallRecorderService } from '../modules/internal/vendors/vendor-call-recorder.service';

export interface AadhaarAddress {
  careOf: string | null;
  country: string | null;
  district: string | null;
  house: string | null;
  locality: string | null;
  pincode: string | null;
  postOffice: string | null;
  state: string | null;
  vtc: string | null;
}

export interface AadhaarKyc {
  uidMasked: string | null;
  name: string | null;
  dob: string | null;
  gender: string | null;
  photo: string | null;
  address: AadhaarAddress | null;
}

@Injectable()
export class VerifyService {
  constructor(private readonly recorder: VendorCallRecorderService) {}

  /* ── credentials ── */

  private get surepassToken(): string {
    const t = process.env.SUREPASS_API_TOKEN;
    if (!t) throw new InternalServerErrorException('Surepass API token is not configured');
    return t;
  }

  private get konnectnxtKey(): string {
    const k = process.env.KONNECTNXT_API_KEY;
    if (!k) throw new InternalServerErrorException('KonnectNxt API key is not configured');
    return k;
  }

  /* ── base URLs ── */

  // The endpoint paths (e.g. `/pan/pan`) assume the base already carries its
  // API-version segment. Some deploys set the env base as the bare host, so we
  // normalise it here — otherwise every call resolves without `/api/vN` and 404s.
  private get surepassBase(): string {
    return this.withVersion(
      process.env.SUREPASS_BASE_URL || SUREPASS.baseUrl,
      '/api/v1',
    );
  }

  private get konnectnxtBase(): string {
    return this.withVersion(
      process.env.KONNECTNXT_BASE_URL || KONNECT_NXT.baseUrl,
      '/api/v2',
    );
  }

  // The v2 BGV endpoints live under /api (not /api/v2), so normalise to that
  // root regardless of whether the env base carries a version segment.
  private get konnectnxtBgvBase(): string {
    return this.withVersion(
      process.env.KONNECTNXT_BASE_URL || KONNECT_NXT.bgvBaseUrl,
      '/api',
    );
  }

  /** Append the version segment unless the base already ends with it. */
  private withVersion(base: string, versionSuffix: string): string {
    const trimmed = base.replace(/\/+$/, '');
    return trimmed.endsWith(versionSuffix) ? trimmed : `${trimmed}${versionSuffix}`;
  }

  /* ── low-level helpers ── */

  private async spPost<T>(path: string, body?: unknown): Promise<T> {
    const base = this.surepassBase;
    const startedAt = Date.now();
    let status: number | undefined;
    let success = false;
    let errorMessage: string | undefined;
    let json: Record<string, unknown> | null = null;
    try {
      let res: Response;
      try {
        res = await fetch(`${base}${path}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.surepassToken}`,
            'Content-Type': 'application/json',
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch {
        errorMessage = 'Could not reach the verification service';
        throw new ServiceUnavailableException(errorMessage);
      }
      status = res.status;
      json = await res.json().catch(() => null);
      if (!res.ok || !(json as Record<string, unknown>)?.success) {
        const msg =
          (json as Record<string, unknown>)?.message ||
          (json as Record<string, unknown>)?.message_code ||
          `Verification failed (HTTP ${res.status})`;
        errorMessage = typeof msg === 'string' ? msg : JSON.stringify(msg);
        throw new BadRequestException(msg);
      }
      success = true;
      return (json as Record<string, unknown>).data as T;
    } finally {
      this.recorder.record({
        vendor: VendorName.SUREPASS,
        endpoint: path,
        httpMethod: 'POST',
        startedAt,
        httpStatusCode: status,
        success,
        errorMessage,
        responseForCost: success ? json : undefined,
      });
    }
  }

  private async spGet<T>(path: string): Promise<T> {
    const base = this.surepassBase;
    const startedAt = Date.now();
    let status: number | undefined;
    let success = false;
    let errorMessage: string | undefined;
    let json: Record<string, unknown> | null = null;
    try {
      let res: Response;
      try {
        res = await fetch(`${base}${path}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.surepassToken}`,
            Accept: 'application/json',
          },
        });
      } catch {
        errorMessage = 'Could not reach the verification service';
        throw new ServiceUnavailableException(errorMessage);
      }
      status = res.status;
      json = await res.json().catch(() => null);
      if (!res.ok || !(json as Record<string, unknown>)?.success) {
        const msg =
          (json as Record<string, unknown>)?.message ||
          (json as Record<string, unknown>)?.message_code ||
          `Verification failed (HTTP ${res.status})`;
        errorMessage = typeof msg === 'string' ? msg : JSON.stringify(msg);
        throw new BadRequestException(msg);
      }
      success = true;
      return (json as Record<string, unknown>).data as T;
    } finally {
      this.recorder.record({
        vendor: VendorName.SUREPASS,
        endpoint: path,
        httpMethod: 'GET',
        startedAt,
        httpStatusCode: status,
        success,
        errorMessage,
        responseForCost: success ? json : undefined,
      });
    }
  }

  private async knPost<T>(
    path: string,
    body?: unknown,
    baseUrl?: string,
  ): Promise<T> {
    const base = baseUrl ?? this.konnectnxtBase;
    const startedAt = Date.now();
    let status: number | undefined;
    let success = false;
    let errorMessage: string | undefined;
    let json: Record<string, unknown> | null = null;
    try {
      let res: Response;
      try {
        res = await fetch(`${base}${path}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.konnectnxtKey}`,
            'Content-Type': 'application/json',
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch {
        errorMessage = 'Could not reach the crime check service';
        throw new ServiceUnavailableException(errorMessage);
      }
      status = res.status;
      const text = await res.text();
      try { json = text ? JSON.parse(text) as Record<string, unknown> : null; } catch { /**/ }
      if (!res.ok) {
        const candidate = json && (json.message || json.detail || json.error);
        const msg = typeof candidate === 'string' ? candidate
          : candidate ? JSON.stringify(candidate)
          : `Request failed (HTTP ${res.status})`;
        errorMessage = msg;
        throw new BadRequestException(msg);
      }
      success = true;
      return (json ?? { raw: text }) as T;
    } finally {
      this.recorder.record({
        vendor: VendorName.KONNECTNXT,
        endpoint: path,
        httpMethod: 'POST',
        startedAt,
        httpStatusCode: status,
        success,
        errorMessage,
        responseForCost: success ? json : undefined,
      });
    }
  }

  private async knGet<T>(path: string, baseUrl?: string): Promise<T> {
    const base = baseUrl ?? this.konnectnxtBase;
    const startedAt = Date.now();
    let status: number | undefined;
    let success = false;
    let errorMessage: string | undefined;
    let json: Record<string, unknown> | null = null;
    try {
      let res: Response;
      try {
        res = await fetch(`${base}${path}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.konnectnxtKey}`,
            Accept: 'application/json',
          },
        });
      } catch {
        errorMessage = 'Could not reach the crime check service';
        throw new ServiceUnavailableException(errorMessage);
      }
      status = res.status;
      const text = await res.text();
      try { json = text ? JSON.parse(text) as Record<string, unknown> : null; } catch { /**/ }
      if (!res.ok) {
        const candidate = json && (json.message || json.detail || json.error);
        const msg = typeof candidate === 'string' ? candidate
          : candidate ? JSON.stringify(candidate)
          : `Request failed (HTTP ${res.status})`;
        errorMessage = msg;
        throw new BadRequestException(msg);
      }
      success = true;
      return (json ?? { raw: text }) as T;
    } finally {
      this.recorder.record({
        vendor: VendorName.KONNECTNXT,
        endpoint: path,
        httpMethod: 'GET',
        startedAt,
        httpStatusCode: status,
        success,
        errorMessage,
        responseForCost: success ? json : undefined,
      });
    }
  }

  /* ── Surepass: PAN ── */

  async pan(idNumber: string) {
    return this.spPost(SUREPASS.endpoints.pan, { id_number: idNumber });
  }

  /* ── Surepass: Voter ID ── */

  async voterId(idNumber: string) {
    return this.spPost(SUREPASS.endpoints.voterId, { id_number: idNumber });
  }

  /* ── Surepass: Passport ── */

  async passport(fileNumber: string, dob: string) {
    return this.spPost(SUREPASS.endpoints.passport, { file_number: fileNumber, dob });
  }

  /* ── Surepass: Driving licence ── */

  async drivingLicense(idNumber: string, dob: string) {
    return this.spPost(SUREPASS.endpoints.drivingLicense, {
      id_number: idNumber,
      dob,
    });
  }

  /* ── Surepass: Employment history (UAN) ── */

  async employmentHistory(uan: string) {
    return this.spPost(SUREPASS.endpoints.employmentHistory, {
      id_number: uan,
    });
  }

  /* ── Surepass: DigiLocker ── */

  async digilockerInitialize() {
    return this.spPost(SUREPASS.endpoints.digilockerInitialize, {
      data: { signup_flow: true, skip_main_screen: false },
    });
  }

  async digilockerStatus(clientId: string) {
    const data = await this.spGet<Record<string, unknown>>(
      SUREPASS.endpoints.digilockerStatus(clientId),
    );
    return {
      status: data.status ?? null,
      completed: Boolean(data.completed),
      failed: Boolean(data.failed),
      aadhaarLinked: Boolean(data.aadhaar_linked),
      errorDescription: data.error_description ?? null,
    };
  }

  async digilockerAadhaar(clientId: string): Promise<AadhaarKyc> {
    // 1. List documents
    const listData = await this.spGet<{ documents?: Array<{ file_id?: string; name?: string; doc_type?: string }> }>(
      SUREPASS.endpoints.digilockerListDocuments(clientId),
    );

    const docs = listData.documents ?? [];
    const aadhaarDoc = docs.find((d) => {
      const dt = (d.doc_type || '').toUpperCase();
      const nm = (d.name || '').toLowerCase();
      return dt === 'ADHAR' || dt === 'AADHAAR' || nm.includes('aadhaar');
    });

    if (!aadhaarDoc?.file_id) {
      throw new BadRequestException(
        'Aadhaar document was not found in this DigiLocker account.',
      );
    }

    // 2. Download document — returns a download_url
    const dlData = await this.spGet<{ download_url?: string }>(
      SUREPASS.endpoints.digilockerAadhaarPdf(clientId),
    );

    const downloadUrl = dlData.download_url;
    if (!downloadUrl) {
      throw new BadRequestException(
        'DigiLocker did not return a download URL for the Aadhaar document.',
      );
    }

    // 3. Fetch the eAadhaar XML from the signed URL
    let xmlRes: Response;
    try {
      xmlRes = await fetch(downloadUrl);
    } catch {
      throw new ServiceUnavailableException(
        'Could not download the Aadhaar XML from DigiLocker.',
      );
    }

    if (!xmlRes.ok) {
      throw new BadRequestException(
        `Could not download Aadhaar XML (HTTP ${xmlRes.status})`,
      );
    }

    const xml = await xmlRes.text();
    const parsed = this.parseAadhaarXml(xml);
    if (!parsed) {
      throw new BadRequestException('Could not parse the Aadhaar XML response.');
    }
    return parsed;
  }

  /* ── KonnectNxt: Crime check ── */

  async crimeCheck(input: {
    name: string;
    fatherName?: string;
    dob?: string;
    address?: string;
    panNumber?: string;
  }) {
    const body: Record<string, string> = { name: input.name };
    if (input.fatherName) body.father_name = input.fatherName;
    if (input.dob) body.dob = input.dob;
    if (input.address) body.address = input.address;
    if (input.panNumber) body.pan_number = input.panNumber.toUpperCase();
    return this.knPost(KONNECT_NXT.endpoints.crimeCheck, body);
  }

  async crimeCheckReport(requestId: string) {
    return this.knGet(
      `${KONNECT_NXT.endpoints.crimeCheck}?request_id=${encodeURIComponent(requestId)}`,
    );
  }

  /* ── KonnectNxt: Credit report (v2 BGV) ── */

  // Submits a credit-report check via the KonnectNxt v2 BGV flow (ported from
  // Recriauth). The credit bureau keys its search on PAN and rejects
  // submissions without a complete structured address (address_type
  // "Current"). Returns the vendor envelope carrying cases_created[].case_id,
  // which is then passed to creditCheckReport to fetch the report PDF.
  async creditCheck(input: {
    name: string;
    fatherName?: string;
    dob?: string;
    panNumber: string;
    street: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
  }) {
    const candidate: Record<string, unknown> = {
      name: input.name,
      ...(input.fatherName ? { father_name: input.fatherName } : {}),
      ...(input.dob ? { dob: input.dob } : {}),
      pan: input.panNumber.toUpperCase(),
      // Backwards-compat string kept alongside the canonical structured address.
      permanent_address: `${input.street}, ${input.city}, ${input.state} ${input.pincode}`,
      addresses: [
        {
          address_type: 'Current',
          street: input.street,
          city: input.city,
          state: input.state,
          country: input.country || 'India',
          pincode: input.pincode,
        },
      ],
    };
    return this.knPost(
      KONNECT_NXT.bgvEndpoints.submit,
      { checks: ['credit_report_check'], candidates: [candidate] },
      this.konnectnxtBgvBase,
    );
  }

  // Fetches the credit-report download URL for a submitted case. The vendor
  // returns the signed PDF URL in `data` once the case completes (null while
  // still processing).
  async creditCheckReport(caseId: string) {
    return this.knGet(
      `${KONNECT_NXT.bgvEndpoints.download}?case_id=${encodeURIComponent(caseId)}&type=pdf`,
      this.konnectnxtBgvBase,
    );
  }

  /* ── XML parser ── */

  private parseAadhaarXml(xml: string): AadhaarKyc | null {
    try {
      const getAttr = (tag: string, attr: string): string | null => {
        const re = new RegExp(`<${tag}\\b[^>]*?\\b${attr}="([^"]*)"`, 'i');
        return xml.match(re)?.[1] ?? null;
      };
      const getContent = (tag: string): string | null => {
        const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
        return xml.match(re)?.[1]?.trim() || null;
      };

      const uid = getAttr('UidData', 'uid');
      const address: AadhaarAddress = {
        careOf: getAttr('Poa', 'co'),
        country: getAttr('Poa', 'country'),
        district: getAttr('Poa', 'dist'),
        house: getAttr('Poa', 'house'),
        locality: getAttr('Poa', 'loc'),
        pincode: getAttr('Poa', 'pc'),
        postOffice: getAttr('Poa', 'po'),
        state: getAttr('Poa', 'state'),
        vtc: getAttr('Poa', 'vtc'),
      };

      return {
        uidMasked: uid ? `XXXX XXXX ${uid.slice(-4)}` : null,
        name: getAttr('Poi', 'name'),
        dob: getAttr('Poi', 'dob'),
        gender: getAttr('Poi', 'gender'),
        photo: getContent('Pht'),
        address,
      };
    } catch {
      return null;
    }
  }
}
