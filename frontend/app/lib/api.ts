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

export function createSubject(
  token: string,
  input: {
    name: string;
    role?: string;
    email: string;
    phone?: string;
    panNumber?: string;
    aadhaarNumber?: string;
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
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminClientRow {
  id: string;
  name: string;
  email: string;
  candidateCount: number;
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

export interface AdminClientDetail {
  client: AdminClientRow;
  subjects: AdminSubjectRow[];
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
  ownerName: string;
  ownerEmail: string;
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
  customer: { name: string; email: string; contact?: string };
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

export function adminSubjects(token: string): Promise<AdminSubjectRow[]> {
  return request<AdminSubjectRow[]>('/admin/subjects');
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
    { credentials: 'include' },
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
