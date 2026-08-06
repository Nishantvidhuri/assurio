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
  consentResult: ConsentResult | null;
  consentAcceptedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

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

/**
 * Upload one ID document (PDF/JPG/PNG). The server virus-scans it before it
 * reaches S3. Uses FormData directly — we must NOT set Content-Type so the
 * browser adds the multipart boundary; auth rides on the httpOnly cookie.
 */
export async function uploadIdDocument(
  file: File,
): Promise<UploadedIdDocument> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/uploads/id-document`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-CSRF-Token': getCsrfToken(),
      'ngrok-skip-browser-warning': 'true',
    },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join(', ')
      : data.message || 'Upload failed';
    throw new Error(message);
  }
  return data as UploadedIdDocument;
}

/** Force-re-run a single ID check for a subject ("Recall API"). */
export function recheckSubject(
  _token: string,
  id: string,
  type: 'pan' | 'aadhaar' | 'voter' | 'passport' | 'dl' | 'employment',
): Promise<Subject> {
  return request<Subject>(
    `/subjects/${encodeURIComponent(id)}/recheck/${type}`,
    { method: 'POST' },
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
export async function subjectReportBlobUrl(
  subjectId: string,
): Promise<string> {
  const res = await fetch(`${API_URL}/subjects/${subjectId}/report`, {
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
  name: string; label: string; health: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  waiting: number; active: number; delayed: number; failed: number; paused: number;
  oldestWaiting: string | null; oldestFailed: string | null;
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
  recentJobs: QueueJob[];
  outboxStats: OutboxStats;
  recentOutboxEvents: OutboxEvent[];
}

export async function adminQueueHealth(_token?: string): Promise<QueueHealth> {
  return request<QueueHealth>('/admin/ops/queues');
}
