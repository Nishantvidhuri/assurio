// Mirrors server/src/modules/scheduling/scheduling.service.ts —
// AdminAssignedAppointmentView shape. Kept hand-written (rather than
// auto-derived) so the frontend has a stable contract even if the
// backend response gets fields added later.
export type AppointmentChannel = 'VIDEO_CALL' | 'PHONE_CALL';
export type AppointmentStatus =
  | 'ASSIGNED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  // Verifier joined the call but it ended without a verdict (audio
  // failure, candidate dropped, server hiccup, etc.). Surfaced as
  // "Incomplete" in the verification-calls list — set when the
  // verifier clicks the "Reschedule Call" backup button on the
  // post-end-call screen.
  | 'INCOMPLETE';

export type VerificationVerdict =
  | 'VERIFIED'
  | 'REJECTED'
  | 'UNABLE_TO_VERIFY';

export interface AdminAssignedAppointment {
  id: string;
  candidateCaseCheckId: string;
  // Parent candidate case — drives the post-verdict "View Details"
  // route in the call-page flow.
  candidateCaseId: string;
  // Assigned verifier surfaced as a Tag on the row card. Both fields
  // are non-null for normal rows; null is a defensive fallback for an
  // appointment whose admin user was deleted out from under it.
  verifierId: string | null;
  verifierName: string | null;
  channel: AppointmentChannel;
  scheduledAt: string;
  endAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  candidateName: string;
  candidatePosition: string | null;
  organizationName: string;
  verdict: VerificationVerdict | null;
}

export interface AdminAssignedAppointmentsBucket {
  items: AdminAssignedAppointment[];
  // null = no more rows to load. Frontend hook gates infinite scroll
  // on `hasMore = nextOffset !== null`.
  nextOffset: number | null;
}

// Re-export so existing consumers can keep importing from here, but
// the canonical home is now `modules/auth/commons/auth.types.ts`
// (the tier lives on AuthUser, surfaced via useAuthSession). New code
// should prefer importing from there.
export type { InternalTeamAccess } from '@/modules/auth/commons/auth.types';

export interface AdminAssignedAppointmentsResponse {
  upcoming: AdminAssignedAppointmentsBucket;
  completed: AdminAssignedAppointmentsBucket;
}

export interface VerifiersListResponse {
  items: Array<{ id: string; name: string }>;
}

// ── Manual scheduling (Schedule Call dialog) ───────────────────────────
// Wire-shape mirrors server's scheduling.service.ts. Kept here (not in a
// separate file) because they're only consumed by one component.

export interface EligibleCandidatesResponse {
  items: Array<{
    candidateCaseCheckId: string;
    candidateName: string;
    candidateEmail: string;
    organizationName: string | null;
  }>;
}

export interface ManualAvailabilitySlot {
  startAt: string; // ISO-8601
  endAt: string;
  adminCount: number;
}

export interface ManualAvailabilityResponse {
  items: ManualAvailabilitySlot[];
}

export interface ManualBookRequest {
  candidateCaseCheckId: string;
  scheduledAt: string; // ISO-8601
  channel: 'VIDEO_CALL';
  verifierUserId?: string; // 'auto' | <id> | undefined
  sendConfirmationEmail: boolean;
}

export interface ManualBookResponse {
  id: string;
  candidateCaseCheckId: string;
  channel: string;
  scheduledAt: string;
  endAt: string;
  durationMinutes: number;
  status: string;
}

// Range-bounded response for the calendar view. NOT paginated — the
// date window itself bounds the size, so the server returns every
// appointment whose slot overlaps [from, to). Mirrors
// scheduling.service.ts → listAssignedAppointmentsInRangeForAdmin.
export interface AdminAssignedAppointmentsRangeResponse {
  items: AdminAssignedAppointment[];
}

// Appointment-detail payload for the AppointmentDetailDialog.
// `report` is null for upcoming / missed states — populated only
// when the call has been reviewed (verified / flagged / rejected).
// Mirrors scheduling.service.ts → AppointmentDetailView.
export interface AppointmentReport {
  id: string;
  verdict: string | null;
  status: string;
  completedAt: string | null;
  // Raw verifier-saved review payload. Shape mirrors the existing
  // InternalVideoKycReport.extractedData used on the verifications
  // detail page; the modal renderer narrows it as needed.
  extractedData: unknown;
  recording: {
    id: string;
    status: string;
    durationSeconds: number | null;
    sizeBytes: number | null;
    completedAt: string | null;
    errorMessage: string | null;
  } | null;
}

export interface AppointmentDetailResponse {
  appointment: AdminAssignedAppointment;
  report: AppointmentReport | null;
}

// ─── Leave exceptions ───────────────────────────────────────────────────

export type LeaveExceptionMode =
  | 'FULL_DAY'
  | 'FIRST_HALF'
  | 'SECOND_HALF'
  | 'CUSTOM';

export interface LeaveExceptionCreatePayload {
  mode: LeaveExceptionMode;
  startAt: string; // ISO 8601
  endAt: string; // ISO 8601
  reason: string;
}

export interface LeaveException {
  id: string;
  mode: LeaveExceptionMode;
  startAt: string;
  endAt: string;
  reason: string;
}

export interface LeaveExceptionCreateResponse extends LeaveException {
  adminUserId: string;
  createdAt: string;
}

export interface LeaveExceptionsRangeResponse {
  items: LeaveException[];
}
