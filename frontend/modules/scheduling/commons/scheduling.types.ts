// Mirrors server/src/modules/scheduling — keep the enum string set
// in sync with prisma's `AppointmentChannel`.
export type AppointmentChannel = 'VIDEO_CALL' | 'PHONE_CALL';

export type AppointmentStatus =
  | 'ASSIGNED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  // Verifier joined the call but it ended without a verdict.
  | 'INCOMPLETE';

// One row per concrete slot start, aggregated across admins. `adminCount`
// is the # of admins still AVAILABLE for the slot at fetch time — the UI
// can use it to badge popular times, but the source of truth is the
// server transaction (only it knows who got the slot).
export interface AvailabilitySlot {
  startAt: string;       // ISO
  endAt: string;         // ISO
  adminCount: number;
}

export interface AvailabilityResponse {
  slots: AvailabilitySlot[];
}

export interface ScheduledAppointment {
  id: string;
  candidateCaseCheckId: string;
  channel: AppointmentChannel;
  scheduledAt: string;   // ISO
  endAt: string;         // ISO (scheduledAt + durationMinutes)
  durationMinutes: number;
  status: AppointmentStatus;
}

export interface AppointmentResponse {
  appointment: ScheduledAppointment;
}

export interface ActiveAppointmentResponse {
  appointment: ScheduledAppointment | null;
}
