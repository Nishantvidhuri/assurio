import { clearSession } from './session';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

/** Read the as_csrf cookie value (non-httpOnly, JS-readable) set by the server. */
function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)as_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Endpoints where a 401 is a normal answer rather than an expired session —
 * a wrong password or a rejected Google code must show an inline error, not
 * bounce the user out of the page they're on.
 */
const AUTH_ENDPOINTS = [
  '/auth/login',
  '/auth/signup',
  '/auth/google',
  '/auth/logout',
  '/auth/csrf',
];

/**
 * A 401 anywhere else means the session cookie is gone or expired (the
 * httpOnly cookie can lapse while localStorage still holds a stale user), so
 * there's nothing the page can usefully render. Clear local state and send the
 * user to login — handled here once instead of in all ~21 pages that call the
 * API, so no screen can get stuck on a dead session.
 */
function handleExpiredSession(path: string): void {
  if (typeof window === 'undefined') return;
  if (AUTH_ENDPOINTS.some((p) => path.startsWith(p))) return;

  clearSession();
  // Guard against a redirect loop if we're somehow already on /login.
  if (!window.location.pathname.startsWith('/login')) {
    window.location.replace('/login');
  }
}

/**
 * Same expired-session guard for the raw `fetch` calls that can't go through
 * request() (multipart uploads, PDF blobs) — so a dead session behaves
 * identically everywhere.
 */
function guardAuth(res: Response, path: string): void {
  if (res.status === 401) handleExpiredSession(path);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const csrfHeader: Record<string, string> = MUTATION_METHODS.has(method)
    ? { 'X-CSRF-Token': getCsrfToken() }
    : {};

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include', // always send the httpOnly as_access cookie
    headers: {
      'Content-Type': 'application/json',
      // Skip ngrok's free-tier interstitial so the API returns JSON, not HTML.
      'ngrok-skip-browser-warning': 'true',
      ...csrfHeader,
      ...(options.headers || {})
    }
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) handleExpiredSession(path);
    const message = Array.isArray(data.message)
      ? data.message.join(', ')
      : data.message || 'Something went wrong';
    throw new Error(message);
  }

  return data as T;
}

/** Fetch a fresh CSRF token from the server and set the as_csrf cookie. */
export async function fetchCsrf(): Promise<void> {
  await request<{ csrfToken: string }>('/auth/csrf');
}

export async function signup(
  name: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  const data = await request<{ user: AuthUser }>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name, email, password })
  });
  return { token: '', user: data.user };
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const data = await request<{ user: AuthUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  return { token: '', user: data.user };
}

/**
 * Complete Google sign-in: the popup's one-time authorization code is
 * exchanged and verified server-side, which then sets the same httpOnly
 * session cookies as email login.
 */
export async function loginWithGoogle(code: string): Promise<AuthResponse> {
  const data = await request<{ user: AuthUser }>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ code })
  });
  return { token: '', user: data.user };
}

export function logout(): Promise<{ ok: true }> {
  return request<{ ok: true }>('/auth/logout', { method: 'POST' });
}

export function me(_token?: string): Promise<AuthUser> {
  return request<AuthUser>('/auth/me');
}

export function updateMe(_token: string | undefined, data: { phone?: string }): Promise<AuthUser> {
  return request<AuthUser>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

export interface PanAddress {
  line_1?: string;
  line_2?: string;
  street_name?: string;
  city?: string;
  state?: string;
  country?: string;
  full?: string;
}

export interface PanData {
  pan_number: string;
  full_name: string;
  gender?: string;
  dob?: string;
  category?: string;
  aadhaar_linked?: boolean;
  dob_verified?: boolean;
  masked_aadhaar?: string;
  email?: string;
  phone_number?: string;
  address?: PanAddress;
}

export function verifyPan(token: string, idNumber: string): Promise<PanData> {
  return request<PanData>('/verify/pan', {
    method: 'POST',
    body: JSON.stringify({ idNumber })
  });
}

export interface DigilockerInit {
  client_id: string;
  token: string;
  url: string;
  expiry_seconds: number;
}

export function digilockerInitialize(token: string): Promise<DigilockerInit> {
  return request<DigilockerInit>('/verify/digilocker/initialize', {
    method: 'POST'
  });
}

export interface DigilockerStatus {
  status: string | null;
  completed: boolean;
  failed: boolean;
  aadhaarLinked: boolean;
  errorDescription: string | null;
}

export function digilockerStatus(
  token: string,
  clientId: string,
): Promise<DigilockerStatus> {
  return request<DigilockerStatus>(
    `/verify/digilocker/status/${encodeURIComponent(clientId)}`,
    { },
  );
}

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

export function digilockerAadhaar(
  token: string,
  clientId: string,
): Promise<AadhaarKyc> {
  return request<AadhaarKyc>(
    `/verify/digilocker/aadhaar/${encodeURIComponent(clientId)}`,
    { },
  );
}

export interface CrimeCheckInput {
  name: string;
  fatherName?: string;
  dob?: string;
  address?: string;
  panNumber?: string;
}

export function crimeCheck(
  token: string,
  input: CrimeCheckInput,
): Promise<Record<string, unknown>> {
  const body: Record<string, string> = { name: input.name };
  if (input.fatherName) body.fatherName = input.fatherName;
  if (input.dob) body.dob = input.dob;
  if (input.address) body.address = input.address;
  if (input.panNumber) body.panNumber = input.panNumber;

  return request<Record<string, unknown>>('/verify/crime-check', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function crimeCheckReport(
  token: string,
  requestId: string,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(
    `/verify/crime-check/${encodeURIComponent(requestId)}`,
    { },
  );
}

// ===== Subjects — one document per person the user is verifying =====

export interface Subject {
  id: string;
  name: string;
  role: string;
  email?: string;
  phone?: string;
  status?: string;
  inviteToken?: string | null;
  inviteUrl?: string | null;
  panFront?: string | null;
  panBack?: string | null;
  panNumber?: string | null;
  aadhaarFront?: string | null;
  aadhaarBack?: string | null;
  aadhaarNumber?: string | null;
  panResult: PanData | null;
  aadhaarResult: AadhaarKyc | null;
  digilockerClientId: string | null;
  digilockerUrl: string | null;
  crimeRequestId: string | null;
  crimeResult: Record<string, unknown> | null;
  /** True once our own copy of the court-record PDF exists in S3. */
  hasCrimeReport?: boolean;
  consentResult: ConsentResult | null;
  consentAcceptedAt?: string | null;
  consentStatus?: ConsentStatus;
  consentDecidedAt?: string | null;
  // Real progress across all applicable checks (matches the report, e.g. 5/7).
  progress?: { done: number; total: number };
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Candidate-consent lifecycle. PENDING → checks are on hold and the charge is
 * refundable; GRANTED → checks run; DECLINED / EXPIRED → the charge was
 * auto-refunded to the client wallet.
 */
export type ConsentStatus = 'PENDING' | 'GRANTED' | 'DECLINED' | 'EXPIRED';

export interface ConsentResult {
  mode: 'TYPED' | 'UPLOADED';
  signerName: string;
  typedSignatureText?: string | null;
  signatureImage?: string | null;
  acceptedAt: string;
}

export type SubjectPatch = Partial<
  Pick<
    Subject,
    | 'name'
    | 'role'
    | 'panResult'
    | 'aadhaarResult'
    | 'digilockerClientId'
    | 'digilockerUrl'
    | 'crimeRequestId'
    | 'crimeResult'
    | 'consentResult'
  >
>;

export function listSubjects(token: string): Promise<Subject[]> {
  return request<Subject[]>('/subjects');
}

export interface UploadedIdDocument {
  key: string;
  name: string;
  contentType: string;
  size: number;
  url: string | null;
}

interface UploadIntentResponse {
  uploadSessionId: string;
  key: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

function uploadErrorMessage(data: unknown, fallback: string): string {
  const m = (data as { message?: string | string[] } | null)?.message;
  if (Array.isArray(m)) return m.join(', ');
  return typeof m === 'string' && m ? m : fallback;
}

/**
 * Durably upload one ID document (PDF/JPG/PNG) via presigned direct-to-S3:
 *   1) POST /uploads/intent           → presign a PUT
 *   2) PUT  <uploadUrl>              → bytes go straight to S3 (never through us)
 *   3) POST /uploads/:id/confirm      → hands off to the finalize + scan workers
 *   4) poll GET /uploads/:id          → resolve once the scan verdict is CLEAN
 *
 * The API never buffers the file, so a server crash mid-upload can't lose it —
 * the job state lives in Postgres/Redis and resumes. Returns the same shape the
 * old single-POST flow did, so callers and the draft's idDocuments[] are
 * unchanged. `onStatus` (optional) surfaces the live lifecycle state for UI.
 */
export async function uploadIdDocument(
  file: File,
  onStatus?: (status: string) => void,
): Promise<UploadedIdDocument> {
  // 1) Intent — presign the PUT.
  const intentRes = await fetch(`${API_URL}/uploads/intent`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCsrfToken(),
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify({
      category: 'ID_DOCUMENT',
      contentType: file.type,
      filename: file.name,
      sizeBytes: file.size,
    }),
  });
  const intent = await intentRes.json().catch(() => ({}));
  guardAuth(intentRes, '/uploads/intent');
  if (!intentRes.ok) {
    throw new Error(uploadErrorMessage(intent, 'Could not start the upload'));
  }
  const { uploadSessionId, uploadUrl, requiredHeaders } =
    intent as UploadIntentResponse;

  // 2) PUT the bytes straight to S3 — no cookie/CSRF, this is S3 not our API.
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: requiredHeaders,
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload to storage failed (${putRes.status})`);
  }

  // 3) Confirm — enqueue the durable finalize + scan pipeline.
  const confirmRes = await fetch(
    `${API_URL}/uploads/${encodeURIComponent(uploadSessionId)}/confirm`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': getCsrfToken(),
        'ngrok-skip-browser-warning': 'true',
      },
    },
  );
  guardAuth(confirmRes, '/uploads/confirm');
  if (!confirmRes.ok) {
    const data = await confirmRes.json().catch(() => ({}));
    throw new Error(uploadErrorMessage(data, 'Could not confirm the upload'));
  }

  // 4) Poll until the worker reports a verdict (CLEAN / INFECTED / FAILED).
  const startedAt = Date.now();
  const TIMEOUT_MS = 90_000;
  const INTERVAL_MS = 1_500;
  for (;;) {
    if (Date.now() - startedAt > TIMEOUT_MS) {
      throw new Error('Upload is taking longer than expected. Please retry.');
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
    const statusRes = await fetch(
      `${API_URL}/uploads/${encodeURIComponent(uploadSessionId)}`,
      {
        credentials: 'include',
        headers: {
          'X-CSRF-Token': getCsrfToken(),
          'ngrok-skip-browser-warning': 'true',
        },
      },
    );
    const body = (await statusRes.json().catch(() => ({}))) as {
      status?: string;
      key?: string;
      url?: string | null;
      name?: string;
      contentType?: string;
      size?: number;
    };
    if (!statusRes.ok) continue; // transient — keep polling within the timeout
    const status = body.status ?? '';
    onStatus?.(status);
    if (status === 'CLEAN') {
      return {
        key: body.key ?? '',
        name: body.name ?? file.name,
        contentType: body.contentType ?? file.type,
        size: body.size ?? file.size,
        url: body.url ?? null,
      };
    }
    if (status === 'INFECTED') {
      throw new Error('This file failed the virus scan and was not saved.');
    }
    if (status === 'FAILED' || status === 'EXPIRED') {
      throw new Error('Upload failed. Please try again.');
    }
    // INTENT_CREATED / PRESIGNED / COMPLETED / SCANNING → keep polling.
  }
}

/** Force-re-run a single ID check for a subject ("Recall API"). */
/** Inputs an operator may correct when re-running a check. Only the fields the
 *  chosen check uses are applied; the rest are ignored server-side. */
export interface RecheckOverrides {
  panNumber?: string;
  voterId?: string;
  passportFileNo?: string;
  drivingLicense?: string;
  uan?: string;
  dob?: string;
}

export function recheckSubject(
  _token: string,
  id: string,
  type:
    | 'pan'
    | 'aadhaar'
    | 'voter'
    | 'passport'
    | 'dl'
    | 'employment'
    | 'crime'
    | 'credit',
  /** Corrected values. Saved to the candidate record before the re-run, so the
   *  report's "Required inputs" reflects what was actually sent. */
  overrides?: RecheckOverrides,
): Promise<Subject> {
  return request<Subject>(
    `/subjects/${encodeURIComponent(id)}/recheck/${type}`,
    { method: 'POST', body: JSON.stringify(overrides ?? {}) },
  );
}

export type ManualPassType =
  | 'pan'
  | 'aadhaar'
  | 'voter'
  | 'passport'
  | 'dl'
  | 'employment'
  | 'crime'
  | 'credit';

/**
 * Admin override: record a check as passed by hand when the vendor API can't
 * answer. Stored as an attributed manual override — the report shows "Verified
 * manually", it does not masquerade as a vendor result.
 */
export function manualPassCheck(
  id: string,
  type: ManualPassType,
  reason?: string,
  /** 'passed' records it verified by hand; 'unable' releases the vendor failure
   *  to the client as "Unable to verify". */
  resolution: 'passed' | 'unable' = 'passed',
): Promise<Subject> {
  return request<Subject>(
    `/subjects/${encodeURIComponent(id)}/manual-pass/${type}`,
    { method: 'POST', body: JSON.stringify({ reason, resolution }) },
  );
}

export interface CrimeSubmitPayload {
  name: string;
  fatherName?: string;
  dob?: string;
  address?: string;
  panNumber?: string;
}

/**
 * Admin override: submit the crime check with fields typed by the operator
 * rather than the ones derived from the candidate record. Used when the
 * automatic run skips the check because DOB / address / father's name never
 * arrived, but the details are known offline.
 *
 * The result still lands on the candidate's report — this is a different way
 * in, not a side channel.
 */
export function submitCrimeCheck(
  id: string,
  payload: CrimeSubmitPayload,
): Promise<Subject> {
  return request<Subject>(
    `/subjects/${encodeURIComponent(id)}/crime-submit`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

/** Immediately delete a previously-uploaded ID document from S3 by its key. */
export async function deleteIdDocument(key: string): Promise<void> {
  await fetch(`${API_URL}/uploads/id-document`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCsrfToken(),
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify({ key }),
  });
}

export function createSubject(
  token: string,
  input: {
    name: string;
    role?: string;
    email?: string;
    phone?: string;
    panNumber?: string;
    aadhaarNumber?: string;
    dob?: string;
    fatherName?: string;
    permanentAddress?: string;
    pincode?: string;
    drivingLicense?: string;
    voterId?: string;
    passportFileNo?: string;
    uan?: string;
    consentAcceptedAt?: string;
    /**
     * How this check is paid. 'razorpay' hands the verified paymentId to the
     * server, which routes it through the wallet ledger (credit + hold) so the
     * charge is refundable until the candidate consents. 'wallet' pays from
     * the existing balance (price computed server-side).
     */
    payment?:
      | { method: 'wallet'; discountCode?: string }
      | { method: 'razorpay'; razorpayPaymentId: string };
  },
): Promise<Subject & { emailSent?: boolean }> {
  return request<Subject & { emailSent?: boolean }>('/subjects', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

// ===== Admin =====

export interface AdminOverview {
  clients: number;
  candidates: number;
  invited: number;
  active: number;
  panChecks: number;
  aadhaarChecks: number;
  crimeChecks: number;
}

export interface AdminSubjectRow {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  status: string;
  ownerName: string;
  ownerEmail: string;
  hasPan: boolean;
  hasAadhaar: boolean;
  hasPanImages: boolean;
  crimeRisk: string | null;
  /** False when the crime check can never run for this candidate (missing
   *  address, DOB or father's name) — there is no result to await. */
  crimeApplicable?: boolean;
  /** True once the check reached a terminal state. */
  crimeSettled?: boolean;
  /** True only when the check actually errored. A settled check with no
   *  crimeRisk is normally a success whose findings are in the PDF, so failure
   *  must be read from here rather than inferred from a missing risk band. */
  crimeFailed?: boolean;
  consentStatus?: ConsentStatus;
  checksDone?: number;
  checksTotal?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminClientRow {
  id: string;
  name: string;
  email: string;
  candidateCount: number;
  /** Checks run so far across this client's candidates. */
  checksDone?: number;
  /** Buy-side vendor cost (₹) for those checks. */
  apiCost?: number;
  /** Revenue (₹) — sum of this client's paid invoices. */
  revenue?: number;
  /** Profit (₹) = revenue − apiCost. */
  profit?: number;
  createdAt?: string;
}

export interface BillingEvent {
  subjectId: string;
  subjectName: string;
  type: 'pan' | 'aadhaar' | 'crime';
  label: string;
  credits: number;
  at?: string;
}

export interface BillingSummary {
  events: BillingEvent[];
  totalCredits: number;
  totalAmount: number;
  byType: { pan: number; aadhaar: number; crime: number };
}

export interface AdminClientDraft {
  id: string;
  /** The in-progress Add-Candidate form values (strings; empty = not filled). */
  data: {
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
    pan?: string;
    aadhaar?: string;
    dob?: string;
    permanentAddress?: string;
    [key: string]: unknown;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminClientDetail {
  client: AdminClientRow;
  subjects: AdminSubjectRow[];
  drafts: AdminClientDraft[];
  billing: BillingSummary;
}

export function getMyBilling(token: string): Promise<BillingSummary> {
  return request<BillingSummary>('/billing/me');
}

// ===== Candidate self-service =====

export interface CandidateInviteInfo {
  name: string;
  email: string;
  status: string;
}

export function inviteInfo(token: string): Promise<CandidateInviteInfo> {
  return request<CandidateInviteInfo>(`/invite/${encodeURIComponent(token)}`);
}

export function setInvitePassword(
  inviteToken: string,
  password: string,
): Promise<AuthResponse> {
  return request<AuthResponse>(
    `/invite/${encodeURIComponent(inviteToken)}/set-password`,
    { method: 'POST', body: JSON.stringify({ password }) },
  );
}

export function forgotPassword(email: string): Promise<{ ok: true }> {
  return request<{ ok: true }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

export interface ResetInfo {
  name: string;
  email: string;
}

export function resetPasswordInfo(token: string): Promise<ResetInfo> {
  return request<ResetInfo>(`/auth/reset/${encodeURIComponent(token)}`);
}

export function resetPassword(
  token: string,
  password: string,
): Promise<AuthResponse> {
  return request<AuthResponse>(`/auth/reset/${encodeURIComponent(token)}`, {
    method: 'POST',
    body: JSON.stringify({ password })
  });
}

export function candidateMe(token: string): Promise<Subject> {
  return request<Subject>('/candidate/me');
}

/**
 * Presign stored document-image keys for preview. Returns a map of
 * key → viewable URL (legacy base64 / http values map to themselves; unknown
 * keys map to null). Used to render a candidate's own uploaded documents,
 * including on resume from a saved draft where only the S3 key is known.
 */
export function signDocumentKeys(
  _token: string,
  keys: string[],
): Promise<Record<string, string | null>> {
  return request<{ urls: Record<string, string | null> }>('/uploads/sign', {
    method: 'POST',
    body: JSON.stringify({ keys }),
  }).then((r) => r.urls);
}

export function candidatePatch(
  token: string,
  patch: Partial<Subject>,
): Promise<Subject> {
  return request<Subject>('/candidate/me', {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
}

export function saveCandidateDraft(
  _token: string,
  patch: Partial<Subject>,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/candidate/me/draft', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function getCandidateDraft(
  _token: string,
): Promise<{ patch: Partial<Subject>; updatedAt: string } | null> {
  return request<{ patch: Partial<Subject>; updatedAt: string } | null>('/candidate/me/draft');
}

export function deleteCandidateDraft(_token: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/candidate/me/draft', { method: 'DELETE' });
}

export interface VerificationLogEntry {
  type: 'pan' | 'aadhaar' | 'crime';
  calledAt: string;
  result: Record<string, unknown>;
}

export interface AdminSubjectDetail {
  consentStatus?: ConsentStatus;
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  status: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  clientName?: string;
  panFront: string | null;
  panBack: string | null;
  panNumber: string | null;
  panResult: Record<string, unknown> | null;
  aadhaarResult: Record<string, unknown> | null;
  digilockerClientId: string | null;
  crimeRequestId: string | null;
  crimeResult: Record<string, unknown> | null;
  /** True once our own copy of the court-record PDF exists in S3. */
  hasCrimeReport?: boolean;
  verificationLog: VerificationLogEntry[];
  createdAt?: string;
  updatedAt?: string;
}


export function adminOverview(token: string): Promise<AdminOverview> {
  return request<AdminOverview>('/admin/overview');
}

// ===== Payments =====

export interface PaymentLink {
  id: string;
  short_url: string;
  status: string;
  amount: number;
  reference_id?: string;
}

export interface CreatePaymentLinkInput {
  amount: number; // rupees
  description?: string;
  customer: { name: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  callbackPath: string; // e.g. "/home/new/success"
  referenceId?: string;
}

export function createPaymentLink(
  token: string,
  input: CreatePaymentLinkInput,
): Promise<PaymentLink> {
  return request<PaymentLink>('/payments/link', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export interface VerifyPaymentInput {
  razorpay_payment_id: string;
  razorpay_payment_link_id: string;
  razorpay_payment_link_reference_id?: string;
  razorpay_payment_link_status: string;
  razorpay_signature: string;
}

// ===== Embedded checkout (Razorpay Orders) =====

export interface CreateOrderInput {
  amount: number; // rupees
  description?: string;
  customer: { name: string; email?: string; contact?: string };
  notes?: Record<string, string>;
}

export interface OrderResponse {
  orderId: string;
  amount: number; // paise
  currency: string;
  keyId: string | null;
}

/** Create a Razorpay Order for the embedded Checkout modal. */
export function createOrder(
  token: string,
  input: CreateOrderInput,
): Promise<OrderResponse> {
  return request<OrderResponse>('/payments/order', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface VerifyOrderInput {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/** Verify an embedded-checkout payment and mint the invoice. */
export function verifyOrderPayment(
  token: string,
  input: VerifyOrderInput,
): Promise<VerifyPaymentResponse> {
  return request<VerifyPaymentResponse>('/payments/verify', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  rate: number;
  total: number;
}

export interface InvoiceResponse {
  id: string;
  invoiceNumber: string;
  status: string;
  customer: { name: string; email: string; phone?: string };
  lineItems: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  taxRatePercent: number;
  currency: string;
  razorpayPaymentId: string;
  razorpayPaymentLinkId?: string;
  paidAt?: string;
  createdAt?: string;
  pdfS3Key?: string | null;
  pdfUrl?: string | null;
}

export interface VerifyPaymentResponse {
  verified: boolean;
  invoice?: InvoiceResponse | null;
  invoiceError?: string;
}

export function verifyPaymentLink(
  token: string,
  input: VerifyPaymentInput,
): Promise<VerifyPaymentResponse> {
  return request<VerifyPaymentResponse>('/payments/verify', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ===== Wallet (prepaid balance + refunds) =====

export interface WalletInfo {
  balancePaise: number;
  balanceInr: number;
  currency: string;
}

export interface WalletTxn {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  reason:
    | 'TOPUP'
    | 'VERIFICATION_CHARGE'
    | 'CONSENT_REFUND'
    | 'ADMIN_CREDIT'
    | 'ADMIN_DEBIT';
  amountPaise: number;
  balanceAfterPaise: number;
  subjectId: string | null;
  invoiceId: string | null;
  note: string | null;
  createdAt: string;
}

export function getWallet(token: string): Promise<WalletInfo> {
  return request<WalletInfo>('/wallet');
}

export function getWalletTransactions(
  token: string,
  cursor?: string,
): Promise<{ items: WalletTxn[]; nextCursor: string | null }> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return request(`/wallet/transactions${qs}`);
}

/** Create a Razorpay Order to add money to the wallet. */
export function createWalletTopupOrder(
  token: string,
  amount: number,
): Promise<OrderResponse> {
  return request<OrderResponse>('/wallet/topup/order', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

/** Verify the checkout callback and credit the wallet (exactly-once). */
export function verifyWalletTopup(
  token: string,
  input: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  },
): Promise<{
  verified: boolean;
  credited?: boolean;
  balancePaise?: number;
  invoiceId?: string;
  invoiceNumber?: string;
}> {
  return request('/wallet/topup/verify', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Public URL to the print-friendly invoice (opens in a new tab). */
export function invoicePrintUrl(invoiceId: string): string {
  return `${API_BASE}/payments/invoice/${encodeURIComponent(invoiceId)}/print`;
}

export function myInvoices(token: string): Promise<InvoiceResponse[]> {
  return request<InvoiceResponse[]>('/payments/invoices/mine');
}

/** Full invoice detail for the side panel (seller/buyer, line items, payment). */
export interface InvoiceDetailResponse {
  id: string;
  invoiceNumber: string;
  status: string;
  customer: { name: string; email: string; phone: string | null };
  lineItems: Array<{
    description?: string;
    quantity?: number;
    rate?: number;
    total?: number;
    credits?: string;
    lineSubtotal?: string;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  taxRatePercent: number;
  currency: string;
  razorpayPaymentId: string | null;
  paidAt: string | null;
  createdAt: string;
  pdfUrl?: string | null;
  /** The client (account holder) billed — "Billed To". */
  buyer?: { name: string; email: string | null; phone: string | null } | null;
}

export function invoiceDetail(id: string): Promise<InvoiceDetailResponse> {
  return request<InvoiceDetailResponse>(
    `/payments/invoice/${encodeURIComponent(id)}`,
  );
}

/* ── Public candidate verification link (no login) — /verify/:token ── */

export interface AadhaarKycAddress {
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

/** The KYC DigiLocker returns for a verified Aadhaar. */
export interface AadhaarKyc {
  uidMasked: string | null;
  name: string | null;
  dob: string | null;
  gender: string | null;
  photo: string | null;
  address: AadhaarKycAddress | null;
}

export interface VerifyLinkInfo {
  candidateName: string;
  consentStatus?: ConsentStatus;
  /** Checks that will run once consent is granted (server-derived). */
  checks?: Array<{ key: string; label: string }>;
  clientName: string;
  email: string;
  phone: string;
  aadhaarNumber: string;
  termsAccepted: boolean;
  digilockerStarted: boolean;
  digilockerClientId: string | null;
  aadhaarVerified: boolean;
  // Stored KYC ("xml data"). The document image (photo) is never stored → null.
  aadhaar: AadhaarKyc | null;
}

const PUBLIC_HEADERS = { 'ngrok-skip-browser-warning': 'true' };

async function publicJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || `Request failed (HTTP ${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** Demo: create a throwaway candidate, email them, and return the working link. */
export async function verifyLinkDemoSend(
  email: string,
  name: string,
): Promise<{ url: string; emailSent: boolean }> {
  const res = await fetch(`${API_URL}/verify-link/demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...PUBLIC_HEADERS },
    body: JSON.stringify({ email, name }),
  });
  return publicJson(res);
}

export async function verifyLinkInfo(token: string): Promise<VerifyLinkInfo> {
  const res = await fetch(`${API_URL}/verify-link/${encodeURIComponent(token)}`, {
    headers: PUBLIC_HEADERS,
  });
  return publicJson<VerifyLinkInfo>(res);
}

export async function verifyLinkConsent(token: string): Promise<void> {
  const res = await fetch(
    `${API_URL}/verify-link/${encodeURIComponent(token)}/consent`,
    { method: 'POST', headers: PUBLIC_HEADERS },
  );
  await publicJson(res);
}

/** Candidate declines consent — closes the case and refunds the client's hold. */
export async function verifyLinkDecline(
  token: string,
): Promise<{ ok: boolean; declined: boolean; refunded: boolean }> {
  const res = await fetch(
    `${API_URL}/verify-link/${encodeURIComponent(token)}/decline`,
    { method: 'POST', headers: PUBLIC_HEADERS },
  );
  return publicJson(res);
}

export async function verifyLinkUpdate(
  token: string,
  body: { name?: string; email?: string; phone?: string; aadhaarNumber?: string },
): Promise<void> {
  const res = await fetch(`${API_URL}/verify-link/${encodeURIComponent(token)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...PUBLIC_HEADERS },
    body: JSON.stringify(body),
  });
  await publicJson(res);
}

export async function verifyLinkDigilockerInit(
  token: string,
): Promise<{ clientId: string | null; url: string | null }> {
  const res = await fetch(
    `${API_URL}/verify-link/${encodeURIComponent(token)}/digilocker/initialize`,
    { method: 'POST', headers: PUBLIC_HEADERS },
  );
  return publicJson(res);
}

export async function verifyLinkDigilockerStatus(token: string): Promise<{
  status?: string;
  completed?: boolean;
  failed?: boolean;
  aadhaarLinked?: boolean;
  errorDescription?: string | null;
}> {
  const res = await fetch(
    `${API_URL}/verify-link/${encodeURIComponent(token)}/digilocker/status`,
    { headers: PUBLIC_HEADERS },
  );
  return publicJson(res);
}

export async function verifyLinkFetchAadhaar(token: string): Promise<void> {
  const res = await fetch(
    `${API_URL}/verify-link/${encodeURIComponent(token)}/digilocker/aadhaar`,
    { method: 'POST', headers: PUBLIC_HEADERS },
  );
  await publicJson(res);
}

/** Admin/owner: email the candidate their verification link. */
export function adminSendVerificationLink(
  subjectId: string,
): Promise<{ ok: true; emailSent: boolean; url: string }> {
  return request(`/subjects/${encodeURIComponent(subjectId)}/send-verification-link`, {
    method: 'POST',
  });
}

export interface AdminMonthly {
  checksThisMonth: number;
  clientsThisMonth: number;
  earningsThisMonth: number;
  checksDoneThisMonth: number;
}

export function adminMonthly(token: string): Promise<AdminMonthly> {
  return request<AdminMonthly>('/admin/monthly');
}

export function adminClients(token: string): Promise<AdminClientRow[]> {
  return request<AdminClientRow[]>('/admin/clients');
}

export function adminClient(
  token: string,
  id: string,
): Promise<AdminClientDetail> {
  return request<AdminClientDetail>(`/admin/clients/${encodeURIComponent(id)}`);
}

/* ── Internal per-client invoices (ported from Recriauth) ── */

export type InvoiceKind = 'INSTANT_PAID' | 'PAYMENT_DUE' | 'POSTPAID';
export type InvoiceBusinessStatus = 'DUE' | 'PAID' | 'VOID';
export type InvoicePaymentTerms =
  | 'NET_15'
  | 'NET_30'
  | 'NET_45'
  | 'NET_60'
  | 'NET_90'
  | 'CUSTOM';
export type InvoicePaymentMethod =
  | 'BANK_REMITTANCE'
  | 'BANK_TRANSFER'
  | 'CASH'
  | 'CHEQUE'
  | 'CREDIT_CARD'
  | 'UPI';

export interface ClientInvoiceRow {
  id: string;
  documentType: 'TAX_INVOICE';
  documentNumber: string;
  status: 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
  kind: InvoiceKind;
  businessStatus: InvoiceBusinessStatus;
  paymentMethod: InvoicePaymentMethod | null;
  paymentTerms: InvoicePaymentTerms | null;
  credits: number | null;
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
  currencyCode: string;
  documentDate: string;
  createdAt: string;
  dueAt: string | null;
  markedPaidAt: string | null;
  voidedAt: string | null;
  billingPeriodKey: string | null;
  initiatedBy: { id: string | null; name: string; email: string | null } | null;
}

export interface ClientInvoiceListMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  selectableTotalItems: number;
  totalPages: number;
}

export interface ClientInvoiceListResponse {
  data: ClientInvoiceRow[];
  meta: ClientInvoiceListMeta;
}

export function adminClientInvoices(
  _token: string,
  clientId: string,
  params: {
    businessStatus?: InvoiceBusinessStatus;
    search?: string;
    minAmount?: string;
    maxAmount?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<ClientInvoiceListResponse> {
  const qs = new URLSearchParams();
  if (params.businessStatus) qs.set('businessStatus', params.businessStatus);
  if (params.search) qs.set('search', params.search);
  if (params.minAmount) qs.set('minAmount', params.minAmount);
  if (params.maxAmount) qs.set('maxAmount', params.maxAmount);
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  const query = qs.toString();
  return request<ClientInvoiceListResponse>(
    `/admin/clients/${encodeURIComponent(clientId)}/invoices${query ? `?${query}` : ''}`,
  );
}


export function adminSubjects(token: string): Promise<AdminSubjectRow[]> {
  return request<AdminSubjectRow[]>('/admin/subjects');
}

// ===== Packages & discount codes (source of truth for the bill amount) =====

export interface PackageRow {
  id: string;
  name: string;
  priceInr: number;
  description?: string | null;
  active: boolean;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DiscountRow {
  id: string;
  code: string;
  percentOff: number;
  active: boolean;
  createdAt?: string;
}

export interface PackageInput {
  name?: string;
  priceInr?: number;
  description?: string;
  active?: boolean;
  isDefault?: boolean;
}

export interface DiscountInput {
  code?: string;
  percentOff?: number;
  active?: boolean;
}

export function adminPackages(_token: string): Promise<PackageRow[]> {
  return request<PackageRow[]>('/admin/packages');
}
export function adminCreatePackage(
  _token: string,
  body: PackageInput,
): Promise<PackageRow> {
  return request<PackageRow>('/admin/packages', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
export function adminUpdatePackage(
  _token: string,
  id: string,
  body: PackageInput,
): Promise<PackageRow> {
  return request<PackageRow>(`/admin/packages/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
export function adminDeletePackage(
  _token: string,
  id: string,
): Promise<unknown> {
  return request(`/admin/packages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function adminDiscounts(_token: string): Promise<DiscountRow[]> {
  return request<DiscountRow[]>('/admin/discounts');
}
export function adminCreateDiscount(
  _token: string,
  body: DiscountInput,
): Promise<DiscountRow> {
  return request<DiscountRow>('/admin/discounts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
export function adminUpdateDiscount(
  _token: string,
  id: string,
  body: DiscountInput,
): Promise<DiscountRow> {
  return request<DiscountRow>(`/admin/discounts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
export function adminDeleteDiscount(
  _token: string,
  id: string,
): Promise<unknown> {
  return request(`/admin/discounts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/** The default package's price — the source of truth for checkout. */
export function defaultPackage(_token: string): Promise<PackageRow | null> {
  return request<PackageRow | null>('/packages/default');
}

export function validateDiscount(
  _token: string,
  code: string,
): Promise<{ valid: boolean; percentOff: number; code: string }> {
  return request('/packages/validate-discount', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export interface AdminDraftDetail {
  id: string;
  data: AdminClientDraft['data'];
  owner: { id: string; name: string; email: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

export function adminDraft(
  token: string,
  id: string,
): Promise<AdminDraftDetail> {
  return request<AdminDraftDetail>(`/admin/drafts/${encodeURIComponent(id)}`);
}

export interface AdminInvoiceRow {
  id: string;
  invoiceNumber: string;
  candidateName: string;
  candidateEmail: string;
  clientName: string;
  clientEmail: string;
  paidAt?: string;
  total: number;
  currency: string;
  status: string;
  checks: { pan: boolean; aadhaar: boolean; crime: boolean };
  /** Vendor/API cost spent on this invoice's verification calls (₹). */
  apiCost: number;
  /** Returned to the client's wallet (consent declined/expired), in ₹. */
  refunded?: number;
  subjectId: string | null;
  razorpayPaymentId: string;
  /** Presigned S3 URL for the invoice PDF (null if not yet uploaded). */
  pdfUrl?: string | null;
}

export function adminInvoices(token: string): Promise<AdminInvoiceRow[]> {
  return request<AdminInvoiceRow[]>('/admin/invoices');
}

export function adminSubject(
  token: string,
  id: string,
): Promise<AdminSubjectDetail> {
  return request<AdminSubjectDetail>(`/admin/subjects/${encodeURIComponent(id)}`);
}

export function adminPatchSubject(
  token: string,
  id: string,
  patch: { crimeRequestId?: string | null; crimeResult?: Record<string, unknown> | null; status?: string },
): Promise<AdminSubjectDetail> {
  return request<AdminSubjectDetail>(`/admin/subjects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
}

export function getSubject(token: string, id: string): Promise<Subject> {
  return request<Subject>(`/subjects/${encodeURIComponent(id)}`);
}

export function patchSubject(
  token: string,
  id: string,
  patch: SubjectPatch,
): Promise<Subject> {
  return request<Subject>(`/subjects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
}

export function deleteSubject(
  token: string,
  id: string,
): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/subjects/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

// Fetches a PDF through the backend proxy (which rewrites Content-Disposition
// so iframes render it inline) and returns a blob URL the iframe can use.
// The caller is responsible for revoking the URL when done.
export async function fetchPdfBlobUrl(
  token: string,
  sourceUrl: string,
): Promise<string> {
  const res = await fetch(
    `${API_URL}/verify/pdf?url=${encodeURIComponent(sourceUrl)}`,
    {
      credentials: 'include',
      headers: { 'ngrok-skip-browser-warning': 'true' },
    },
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const candidate = data?.message;
    const message = Array.isArray(candidate)
      ? candidate.join(', ')
      : candidate || `Failed to load PDF (HTTP ${res.status})`;
    throw new Error(message);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export type MockReportVariant = 'success' | 'pending' | 'failed';

/**
 * Fetches a fully-populated mock report (PDF) in one of three states and returns
 * a blob URL for an <iframe>/preview modal. Caller revokes the URL when done.
 */
export async function mockReportBlobUrl(
  _token: string,
  variant: MockReportVariant,
): Promise<string> {
  // Auth via the httpOnly `as_access` cookie (credentials: 'include'). We can't
  // send an Authorization header — it isn't in the backend CORS allow-list, so
  // adding it fails the preflight ("Failed to fetch").
  const res = await fetch(`${API_URL}/subjects/report/mock/${variant}`, {
    credentials: 'include',
    headers: { 'ngrok-skip-browser-warning': 'true' },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const candidate = (data as { message?: unknown })?.message;
    const message = Array.isArray(candidate)
      ? candidate.join(', ')
      : (candidate as string) || `Failed to load report (HTTP ${res.status})`;
    throw new Error(message);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Fetches a real candidate's Background Verification Report (PDF) inline and
 * returns a blob URL for a preview modal / iframe. Caller revokes when done.
 * Auth via the httpOnly `as_access` cookie (no Authorization header — not in the
 * CORS allow-list).
 */

/** Direct URL to a candidate's report PDF — for opening in a new tab. */
/**
 * The court-record PDF, served from our own bucket through the API. The
 * vendor's Google Storage link is never exposed to a browser: it needs no
 * authentication, we cannot expire it, and it names our supplier.
 */
export function crimeReportPdfUrl(subjectId: string): string {
  return `${API_URL}/subjects/${encodeURIComponent(subjectId)}/crime-report`;
}

export function subjectReportUrl(subjectId: string): string {
  return `${API_URL}/subjects/${encodeURIComponent(subjectId)}/report`;
}

/**
 * Downloads a candidate's full Background Verification Report (PDF, all checks)
 * from the backend and triggers a browser save. Works for both owners (their own
 * candidates) and admins (any candidate).
 */
export async function downloadSubjectReport(
  _token: string,
  subjectId: string,
  candidateName?: string,
): Promise<void> {
  // Auth via the httpOnly `as_access` cookie — see note on mockReportBlobUrl;
  // an Authorization header isn't CORS-allowed and breaks the preflight.
  const res = await fetch(`${API_URL}/subjects/${subjectId}/report?download=1`, {
    credentials: 'include',
    headers: { 'ngrok-skip-browser-warning': 'true' },
  });
  guardAuth(res, '/subjects/report');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const candidate = (data as { message?: unknown })?.message;
    const message = Array.isArray(candidate)
      ? candidate.join(', ')
      : (candidate as string) || `Failed to generate report (HTTP ${res.status})`;
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const safe = (candidateName || 'candidate')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const a = document.createElement('a');
  a.href = url;
  a.download = `assurio-report-${safe}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


export interface BulkCandidate {
  name: string;
  email: string;
  phone?: string;
  role?: string;
  panNumber?: string;
  aadhaarNumber?: string;
}

export interface BulkBatchStatus {
  batchId: string;
  userId: string;
  total: number;
  done: number;
  failed: number;
  status: string;
  failedRows: Array<{ row: number; email: string; reason: string }>;
  createdAt: string;
}

export function bulkInvite(
  token: string,
  candidates: BulkCandidate[],
): Promise<{ batchId: string; total: number }> {
  return request<{ batchId: string; total: number }>('/subjects/bulk', {
    method: 'POST',
    body: JSON.stringify({ candidates })
  });
}

export function bulkStatus(token: string, batchId: string): Promise<BulkBatchStatus> {
  return request<BulkBatchStatus>(`/subjects/bulk/${batchId}`);
}

// ===== Admin Operations =====

export interface QueueStat {
  name: string; label: string; health: 'HEALTHY' | 'WARNING' | 'DEGRADED' | 'CRITICAL';
  waiting: number; active: number; delayed: number; failed: number; paused: number;
  backlogAgeSeconds?: number | null;
  oldestWaiting: string | null; oldestFailed: string | null;
}

export interface OpsAlert {
  id: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  queueName: string | null;
  title: string;
  message: string;
  occurrenceCount: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
  acknowledgedAt: string | null;
}

export interface QueueJob {
  queue: string; name: string; status: string;
  progress: number; attempts: number;
  timestamp: number; finishedOn: number | null; failedReason: string | null;
}

export interface OutboxStats {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
}

export interface OutboxEvent {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  target: string;
  processedAt: string | null;
  lastError: string | null;
  idempotencyKey: string | null;
  createdAt: string | null;
}

export interface QueueHealth {
  generatedAt: string;
  thresholds: { deadJob: number; backlogSec: number };
  queues: QueueStat[];
  activeAlerts: OpsAlert[];
  monitoredQueueCount: number;
  recentJobs: QueueJob[];
  outboxStats: OutboxStats;
  recentOutboxEvents: OutboxEvent[];
}

export async function adminQueueHealth(_token?: string): Promise<QueueHealth> {
  return request<QueueHealth>('/admin/ops/overview');
}

/** Acknowledge an active operational alert. */
export async function adminAcknowledgeAlert(id: string): Promise<void> {
  await request(`/admin/ops/alerts/${encodeURIComponent(id)}/acknowledge`, {
    method: 'POST',
  });
}

/** Run the observability sweep on demand (re-evaluates queue health + alerts). */
export async function adminRunReconciliation(): Promise<{ ok: true }> {
  return request<{ ok: true }>('/admin/ops/reconciliation/run', {
    method: 'POST',
  });
}

/* ── WhatsApp (OpenWA) ── */

export function checkWhatsAppNumber(
  _token: string,
  phone: string,
): Promise<{ phone: string; onWhatsApp: boolean | null }> {
  return request<{ phone: string; onWhatsApp: boolean | null }>(
    `/whatsapp/check/${encodeURIComponent(phone)}`,
  );
}

export interface WaMessage {
  id: string;
  waMessageId?: string;
  chatId?: string;
  body: string;
  type: string;
  direction: 'inbound' | 'outbound';
  timestamp: number;
  status?: string;
  mediaMimetype?: string;
  /** Durable presigned S3 URL when the platform kept its own copy of the media. */
  mediaUrl?: string;
  /** Original filename, when the platform stored the media itself. */
  mediaFilename?: string;
  /** Client-only: object URL for an optimistically-sent local attachment. */
  localUrl?: string;
}

/** Conversation (sent + received) with a WhatsApp number. */
export function getWhatsAppMessages(
  _token: string,
  phone: string,
): Promise<{ phone: string; configured: boolean; messages: WaMessage[] }> {
  return request(`/whatsapp/messages/${encodeURIComponent(phone)}`);
}

/**
 * Fetches a message's stored media (image/pdf) through the authenticated proxy
 * and returns an object URL. Caller must revokeObjectURL when done.
 */
export async function fetchWhatsAppMediaUrl(
  chatId: string,
  messageId: string,
): Promise<string> {
  const res = await fetch(
    `${API_URL}/whatsapp/media?chatId=${encodeURIComponent(
      chatId,
    )}&messageId=${encodeURIComponent(messageId)}`,
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error('media unavailable');
  return URL.createObjectURL(await res.blob());
}

export interface WaChat {
  id: string;
  phone: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  timestamp: number;
  lastMessage: string;
}

export interface WaScenario {
  id: string;
  audience: 'client' | 'candidate';
  label: string;
  trigger: string;
  text: string;
}

/** Every lifecycle notification with sample data, for the /whatsapptest page. */
export function getWhatsAppScenarios(): Promise<{ scenarios: WaScenario[] }> {
  return request('/whatsapp/scenarios');
}

/** Send catalog scenarios to a number. Omit `ids` to send all of them. */
export function sendWhatsAppScenarios(
  phone: string,
  ids?: string[],
): Promise<{ sent: number; results: Array<{ id: string; ok: boolean }> }> {
  return request('/whatsapp/scenarios/send', {
    method: 'POST',
    body: JSON.stringify({ phone, ids }),
  });
}

export interface WaContact {
  phone: string;
  name: string;
  kind: 'candidate' | 'client' | 'draft';
}

/** Conversations for the connected session, plus every candidate/client/draft
 *  number we hold — so contacts with no conversation yet still appear. Always
 *  restricted server-side; personal chats/groups are never returned. */
export function getWhatsAppChats(
  _token: string,
): Promise<{ configured: boolean; chats: WaChat[]; contacts: WaContact[] }> {
  return request('/whatsapp/chats');
}

export function sendWhatsAppText(
  _token: string,
  phone: string,
  message: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/whatsapp/send', {
    method: 'POST',
    body: JSON.stringify({ phone, message }),
  });
}

export function sendWhatsAppPdf(
  _token: string,
  phone: string,
  base64: string,
  filename: string,
  caption?: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/whatsapp/send-pdf', {
    method: 'POST',
    body: JSON.stringify({ phone, base64, filename, caption }),
  });
}

export function sendWhatsAppImage(
  _token: string,
  phone: string,
  base64: string,
  mimetype: string,
  filename: string,
  caption?: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/whatsapp/send-image', {
    method: 'POST',
    body: JSON.stringify({ phone, base64, mimetype, filename, caption }),
  });
}
