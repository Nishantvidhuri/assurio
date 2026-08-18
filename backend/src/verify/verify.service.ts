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
  // Needed to build the credit bureau's structured address. `subdist` is the
  // best source of a real city name on urban Aadhaar; street/landmark sharpen
  // the street line.
  subDistrict: string | null;
  street: string | null;
  landmark: string | null;
}

export interface AadhaarKyc {
  uidMasked: string | null;
  name: string | null;
  dob: string | null;
  gender: string | null;
  photo: string | null;
  address: AadhaarAddress | null;
}

/**
 * Shown when the candidate finished DigiLocker consent but did not share their
 * Aadhaar (selected a different document, or none). Actionable: they can retry
 * and pick Aadhaar. Surfaced verbatim to the candidate; the frontend offers a
 * "Try again" that mints a fresh DigiLocker session (new client_id).
 */
export const NO_AADHAAR_SHARED =
  "No Aadhaar was shared from your DigiLocker account. Please try again and select 'Aadhaar' when DigiLocker asks which document to share.";


/**
 * SurePass 4xx/5xx responses carry a human-readable reason on `message`
 * (e.g. "PAN Not Found." / "Aadhaar Not Found.") with a stable identifier on
 * `message_code` (e.g. "pan_not_found"). Ported verbatim from Recriauth:
 *
 *   • 4xx (incl. 422) = a GENUINE verification outcome (invalid / not found) —
 *     surface the vendor's message untouched. Retrying will NOT help.
 *   • 5xx = the vendor's upstream source is down — reframe as vendor-side so
 *     ops know a retry later is the right move.
 */
function extractUpstreamMessage(
  parsedBody: unknown,
  statusCode: number,
): string {
  let upstream: string | null = null;
  if (parsedBody && typeof parsedBody === 'object') {
    const body = parsedBody as { message?: unknown; message_code?: unknown };
    if (typeof body.message === 'string' && body.message.trim().length > 0) {
      upstream = body.message.trim();
    } else if (
      typeof body.message_code === 'string' &&
      body.message_code.trim().length > 0
    ) {
      upstream = body.message_code.trim();
    }
  }
  if (statusCode >= 500) {
    return upstream
      ? `Source unavailable at verification vendor (SurePass ${statusCode}: ${upstream}) — retry later`
      : `Source unavailable at verification vendor (SurePass HTTP ${statusCode}) — retry later`;
  }
  return upstream ?? `Upstream responded with status ${statusCode}`;
}

/**
 * KonnectNxt wraps payloads in `{ status, code, message, data, credits_* }`.
 * Its `message` carries the reason on failure; fall back to the bare status.
 * (Ported from Recriauth's KonnectNxt client.)
 */
function knUpstreamMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const m = (body as Record<string, unknown>).message;
    if (typeof m === 'string' && m.trim().length > 0) return m;
  }
  return `HTTP ${status}`;
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
        const msg = extractUpstreamMessage(json, res.status);
        errorMessage = msg;
        // 5xx = vendor source down (retryable); 4xx = genuine outcome
        // (invalid / not found — retrying won't help).
        throw res.status >= 500
          ? new ServiceUnavailableException(msg)
          : new BadRequestException(msg);
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
        const msg = extractUpstreamMessage(json, res.status);
        errorMessage = msg;
        // 5xx = vendor source down (retryable); 4xx = genuine outcome
        // (invalid / not found — retrying won't help).
        throw res.status >= 500
          ? new ServiceUnavailableException(msg)
          : new BadRequestException(msg);
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
        const msg = knUpstreamMessage(json, res.status);
        errorMessage = msg;
        // 5xx = vendor source down (retryable); 4xx = genuine outcome.
        throw res.status >= 500
          ? new ServiceUnavailableException(msg)
          : new BadRequestException(msg);
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

  /**
   * `passThrough` lists non-2xx statuses that are outcomes rather than errors,
   * returned to the caller as a parsed body instead of thrown. Defaults to the
   * report-GET pending pair; crime-check adds 400, which it uses for a genuine
   * "verification failed" verdict.
   */
  private async knGet<T>(
    path: string,
    baseUrl?: string,
    passThrough: number[] = [202, 404],
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
      // 202 (processing) and 404 (report not ready yet) are expected,
      // non-error states for the report GET — the poller branches on
      // `data.status`. Everything else non-2xx is a real failure.
      if (!res.ok && !passThrough.includes(res.status)) {
        const msg = knUpstreamMessage(json, res.status);
        errorMessage = msg;
        throw res.status >= 500
          ? new ServiceUnavailableException(msg)
          : new BadRequestException(msg);
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
    const data = (await this.spPost(SUREPASS.endpoints.pan, {
      id_number: idNumber,
    })) as Record<string, unknown> | null;
    // A well-formatted but non-existent PAN returns HTTP 200 with empty data.
    // A real record always carries a PAN number + name — otherwise it's invalid.
    if (!data || (!data.pan_number && !data.full_name)) {
      throw new BadRequestException('This PAN is invalid or does not exist');
    }
    return data;
  }

  /* ── Surepass: Voter ID ── */

  async voterId(idNumber: string) {
    return this.spPost(SUREPASS.endpoints.voterId, { id_number: idNumber });
  }

  /**
   * Surepass expects DOB as `YYYY-MM-DD`, but the candidate form stores it as
   * `DD-MM-YYYY` (or `DD/MM/YYYY`). Normalise so DL/passport payloads validate.
   */
  /**
   * Vendors parse dates with Python's `%Y-%m-%d`; our forms store DD-MM-YYYY.
   * Sending the raw form value fails with
   *   time data '09-06-2004' does not match format '%Y-%m-%d'
   * so every dob we send must go through here. Accepts 1-2 digit day/month and
   * passes an already-ISO value straight back.
   */
  private toIsoDob(dob: string): string {
    const iso = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return dob;
    const m = dob.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (!m) return dob;
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  /**
   * KonnectNxt's crime-check endpoint documents `dob` as DD-MM-YYYY — the
   * inverse of every Surepass endpoint, which wants ISO. Accepts either shape
   * and normalises to the vendor's, so callers can keep passing whatever the
   * form stored.
   */
  private toDdMmYyyyDob(dob: string): string {
    const iso = dob.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
      return `${iso[3].padStart(2, '0')}-${iso[2].padStart(2, '0')}-${iso[1]}`;
    }
    const m = dob.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (!m) return dob;
    return `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}-${m[3]}`;
  }

  /* ── Surepass: Passport ── */

  async passport(fileNumber: string, dob: string) {
    // Surepass passport-details keys the file number on `id_number` (NOT
    // `file_number`, which it rejects with "Input payload validation failed").
    return this.spPost(SUREPASS.endpoints.passport, {
      id_number: fileNumber,
      dob: this.toIsoDob(dob),
    });
  }

  /* ── Surepass: Driving licence ── */

  async drivingLicense(idNumber: string, dob: string) {
    return this.spPost(SUREPASS.endpoints.drivingLicense, {
      id_number: idNumber,
      dob: this.toIsoDob(dob),
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

  /**
   * Fetch the verified Aadhaar KYC via the Surepass DigiLocker document flow:
   *   1. list-documents/:clientId       → find the Aadhaar file_id
   *   2. download-document/:clientId/:id → short-lived signed URL
   *   3. GET that URL                    → the signed eAadhaar XML
   *   4. parse the XML                   → AadhaarKyc
   * Unlike `download-aadhaar` (one-time, "already_downloaded" on re-call), this
   * flow can be re-run — list-documents + download-document mint a fresh URL.
   * The raw XML / photo are never persisted here; the caller decides what to
   * store (currently: KYC fields minus the photo).
   */
  async digilockerAadhaar(clientId: string): Promise<AadhaarKyc> {
    // 1. Enumerate documents and locate the Aadhaar entry. list-documents
    // returns two Aadhaar rows — a PDF (file_id "aadhaar") and the parseable
    // XML (file_id "digilocker_file_...", file_type "xml"). We need the XML.
    const listData = await this.spGet<{
      documents?: Array<{
        file_id?: string;
        name?: string;
        doc_type?: string;
        file_type?: string;
      }>;
    }>(SUREPASS.endpoints.digilockerListDocuments(clientId));

    const docs = listData.documents ?? [];
    const isAadhaar = (d: { doc_type?: string; name?: string }): boolean => {
      const dt = (d.doc_type || '').toUpperCase();
      const nm = (d.name || '').toLowerCase();
      return dt === 'ADHAR' || dt === 'AADHAAR' || nm.includes('aadhaar');
    };
    // Aadhaar-only: prefer the parseable XML row, else any Aadhaar row. We do
    // NOT fall back to a non-Aadhaar document — if the candidate shared some
    // other doc (e.g. PAN), that's a "no Aadhaar" outcome, not a success.
    const aadhaarDoc =
      docs.find(
        (d) => isAadhaar(d) && (d.file_type || '').toLowerCase() === 'xml',
      ) ?? docs.find(isAadhaar);

    if (!aadhaarDoc?.file_id) {
      throw new BadRequestException(NO_AADHAAR_SHARED);
    }

    // 2. Resolve a signed download URL for that document.
    const dlData = await this.spGet<{ download_url?: string }>(
      SUREPASS.endpoints.digilockerDownloadDocument(
        clientId,
        aadhaarDoc.file_id,
      ),
    );
    const downloadUrl = dlData.download_url;
    if (!downloadUrl) {
      throw new BadRequestException(
        'DigiLocker did not return a download URL for the Aadhaar document.',
      );
    }

    // 3. Fetch the signed eAadhaar XML.
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

    // 4. Parse the XML into our KYC shape. If it carries neither a name nor a
    // masked UID it isn't a usable Aadhaar (e.g. a non-Aadhaar doc slipped
    // through) — treat as "no Aadhaar shared" so the candidate can retry.
    const parsed = this.parseAadhaarXml(xml);
    if (!parsed || (!parsed.name && !parsed.uidMasked)) {
      throw new BadRequestException(NO_AADHAAR_SHARED);
    }
    return parsed;
  }

  /**
   * Parse a signed eAadhaar XML (Certificate → KycRes → UidData) into KYC.
   * Attribute-order-independent; reads the English `Poi`/`Poa` (not the
   * localised `LData`). `Pht` carries the base64 photo.
   */
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
        subDistrict: getAttr('Poa', 'subdist'),
        street: getAttr('Poa', 'street'),
        landmark: getAttr('Poa', 'landmark'),
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

  /* ── KonnectNxt: Crime check ── */

  /**
   * Initiates a court/criminal-records check. This does NOT return a verdict —
   * KonnectNxt queues the search and answers with a `request_id`, which
   * crimeCheckReport then polls until the vendor marks it completed. Court
   * records are searched manually at source, so the vendor documents a typical
   * turnaround of 24-48 hours.
   *
   *   POST {base}/api/v2/verification/crime-check/
   *   → { data: { status: 'initiated', request_id, request_time } }
   *
   * Only `name` is mandatory; every other field narrows the search, so we send
   * whatever the candidate supplied. The address is free text (the vendor caps
   * it at 255 chars) rather than the structured shape the BGV bureau demands.
   */
  async crimeCheck(input: {
    name: string;
    fatherName?: string;
    dob?: string;
    panNumber?: string;
    address?: string;
  }) {
    const address = (input.address || '').trim().slice(0, 255);
    return this.knPost(KONNECT_NXT.endpoints.crimeCheck, {
      name: input.name.trim().slice(0, 255),
      ...(input.fatherName
        ? { father_name: input.fatherName.trim().slice(0, 255) }
        : {}),
      // Crime-check wants DD-MM-YYYY, unlike every Surepass endpoint. Normalise
      // here, not just at the callers — the manual /verify endpoints hand us
      // whatever the DTO carried.
      ...(input.dob ? { dob: this.toDdMmYyyyDob(input.dob) } : {}),
      ...(input.panNumber ? { pan_number: input.panNumber.toUpperCase() } : {}),
      // The vendor rejects addresses under 10 chars; omit rather than fail the
      // whole submission over a stub like "Delhi".
      ...(address.length >= 10 ? { address } : {}),
    });
  }

  /**
   * Polls a crime check by the `request_id` from crimeCheck. Free — the vendor
   * documents this call as consuming no credits, so polling costs nothing.
   *
   *   GET {base}/api/v2/verification/crime-check/?request_id=...
   *   → 202 { data: { status: 'in_progress' } }        still searching
   *   → 200 { data: { status: 'completed', risk_assessment: { risk_type,
   *            risk_summary, number_of_cases }, cases: [], download_link } }
   *   → 400 verification failed        → 404 report not available / unknown id
   *
   * 202/404/400 are passed through rather than thrown: all three are documented
   * report states, so the caller branches on the body. Only 401 and 5xx — our
   * misconfiguration or their outage — surface as exceptions to retry.
   */
  async crimeCheckReport(requestId: string) {
    return this.knGet(
      `${KONNECT_NXT.endpoints.crimeCheck}?request_id=${encodeURIComponent(requestId)}`,
      undefined,
      [202, 404, 400],
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
    phone?: string;
    email?: string;
  }) {
    const candidate: Record<string, unknown> = {
      name: input.name,
      ...(input.fatherName ? { father_name: input.fatherName } : {}),
      ...(input.dob ? { dob: this.toIsoDob(input.dob) } : {}),
      pan: input.panNumber.toUpperCase(),
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.email ? { email: input.email } : {}),
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

}
