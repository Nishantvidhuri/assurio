import type { AccessRole } from '@/shared/commons/access-roles';

export type AppUserType = 'INTERNAL' | 'CLIENT' | 'CANDIDATE';

// Mirrors the server-side UserRole enum (prisma/schema.prisma).
// Flat, user-type-prefixed so each user type's roles stay distinct.
// Extend here as new roles are added on the server.
export type UserRole =
  | 'INTERNAL_ADMIN'
  | 'CLIENT_ADMIN'
  | 'CLIENT_HR';

// Mirrors the server-side InternalTeamAccess enum. Only meaningful for
// INTERNAL users; null for CLIENT / CANDIDATE and for any internal
// account whose InternalTeamEmployee row was removed.
export type InternalTeamAccess = AccessRole;

// Mirrors the server-side OrganizationBillingModel enum. PREPAID orgs spend a
// credits wallet; POSTPAID orgs accrue rupee consumption billed monthly.
export type OrganizationBillingModel = 'PREPAID' | 'POSTPAID';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  userType: AppUserType;
  /** Role within the user's user type. Null for user types without assigned roles (e.g. CANDIDATE). */
  role: UserRole | null;
  /**
   * Internal-team access tier. Drives admin-only UI gates (e.g. the
   * "Select Verifier" dropdown on the Verification Calls page). For
   * cosmetic gating only — every server endpoint that needs access
   * checks re-derives it from the DB on each request.
   * Null for non-INTERNAL users and for internal users without a team row.
   */
  access: InternalTeamAccess | null;
  organizationId: string | null;
  organizationName?: string | null;
  /**
   * Billing model of the user's organization. Drives which billing surface a
   * CLIENT user sees (credits wallet vs postpaid monthly billing). Null for
   * users without an organization (e.g. INTERNAL staff).
   */
  organizationBillingModel?: OrganizationBillingModel | null;
  phoneNumber: string | null;
  department: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface OnboardingSetPasswordResult {
  user: AuthUser;
  candidateCaseId: string | null;
  workspaceId: string | null;
}

export interface AcceptCandidateCaseInvitationResult {
  accepted: true;
  candidateCaseId: string;
  workspaceId: string;
}

export interface InviteClientUserInput {
  organizationName: string;
  email: string;
  name: string;
}
