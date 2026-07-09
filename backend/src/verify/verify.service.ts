import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { KONNECT_NXT, SUREPASS } from '../common/vendors';

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

  /* ── low-level helpers ── */

  private async spPost<T>(path: string, body?: unknown): Promise<T> {
    const base = process.env.SUREPASS_BASE_URL || SUREPASS.baseUrl;
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
      throw new ServiceUnavailableException('Could not reach the verification service');
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || !(json as Record<string, unknown>)?.success) {
      const msg =
        (json as Record<string, unknown>)?.message ||
        (json as Record<string, unknown>)?.message_code ||
        `Verification failed (HTTP ${res.status})`;
      throw new BadRequestException(msg);
    }
    return (json as Record<string, unknown>).data as T;
  }

  private async spGet<T>(path: string): Promise<T> {
    const base = process.env.SUREPASS_BASE_URL || SUREPASS.baseUrl;
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
      throw new ServiceUnavailableException('Could not reach the verification service');
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || !(json as Record<string, unknown>)?.success) {
      const msg =
        (json as Record<string, unknown>)?.message ||
        (json as Record<string, unknown>)?.message_code ||
        `Verification failed (HTTP ${res.status})`;
      throw new BadRequestException(msg);
    }
    return (json as Record<string, unknown>).data as T;
  }

  private async knPost<T>(path: string, body?: unknown): Promise<T> {
    const base = process.env.KONNECTNXT_BASE_URL || KONNECT_NXT.baseUrl;
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
      throw new ServiceUnavailableException('Could not reach the crime check service');
    }
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try { json = text ? JSON.parse(text) as Record<string, unknown> : null; } catch { /**/ }
    if (!res.ok) {
      const candidate = json && (json.message || json.detail || json.error);
      const msg = typeof candidate === 'string' ? candidate
        : candidate ? JSON.stringify(candidate)
        : `Request failed (HTTP ${res.status})`;
      throw new BadRequestException(msg);
    }
    return (json ?? { raw: text }) as T;
  }

  private async knGet<T>(path: string): Promise<T> {
    const base = process.env.KONNECTNXT_BASE_URL || KONNECT_NXT.baseUrl;
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
      throw new ServiceUnavailableException('Could not reach the crime check service');
    }
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try { json = text ? JSON.parse(text) as Record<string, unknown> : null; } catch { /**/ }
    if (!res.ok) {
      const candidate = json && (json.message || json.detail || json.error);
      const msg = typeof candidate === 'string' ? candidate
        : candidate ? JSON.stringify(candidate)
        : `Request failed (HTTP ${res.status})`;
      throw new BadRequestException(msg);
    }
    return (json ?? { raw: text }) as T;
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
