import { ACCESS_ROLE, type AccessRole } from '@/shared/commons/access-roles';

export type InternalTeamAccess = AccessRole;

export const INTERNAL_TEAM_ACCESS = ACCESS_ROLE;

export type InternalTeamEmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';

export interface InternalTeamEmployee {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  normalizedEmail: string;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  jobTitle: string;
  country: string | null;
  state: string | null;
  city: string | null;
  access: InternalTeamAccess;
  status: InternalTeamEmployeeStatus;
  manager: string | null;
  createdAt: string;
  updatedAt: string;
}

export const MANAGER_OPTIONS: { label: string; value: string }[] = [
  { label: 'Ujjwal Aman', value: 'Ujjwal Aman' },
  { label: 'Krishan Chaturvedi', value: 'Krishan Chaturvedi' },
];

export interface InternalTeamListMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  viewerAccess: InternalTeamAccess | null;
  /** The viewer's own employee id — used to block self-deletion in the UI. */
  viewerEmployeeId: string | null;
  /** Rows the viewer may bulk-delete (everything except their own row). */
  selectableTotalItems: number;
}

export interface InternalTeamBulkSelectionPayload {
  mode: 'EXPLICIT' | 'ALL_MATCHING';
  ids: string[];
  excludedIds: string[];
  filters: {
    search?: string;
    access?: InternalTeamAccess[];
    status?: InternalTeamEmployeeStatus[];
    manager?: string[];
    state?: string[];
  };
}

export interface BulkDeleteEmployeesResult {
  deletedCount: number;
  skippedCount: number;
}

// A team row as returned by the list endpoint — carries invite status so the
// table can show an "Awaiting Acceptance" / "Invitation Expired" tag + timer.
// `isDeactivated` is true for soft-deleted rows; the row still appears in
// the table with a Deactivated tag + Activate row action.
export interface InternalTeamEmployeeListItem extends InternalTeamEmployee {
  isDeactivated: boolean;
  isPendingInvite: boolean;
  invitationExpiresAt: string | null;
}

export interface InternalTeamListResponse {
  data: InternalTeamEmployeeListItem[];
  meta: InternalTeamListMeta;
}

export interface CreateEmployeePayload {
  employeeId: string;
  name: string;
  email: string;
  phoneCountryCode?: string;
  phoneNumber?: string;
  jobTitle: string;
  country?: string;
  state?: string;
  city?: string;
  access: InternalTeamAccess;
  manager?: string;
}

export interface UpdateEmployeePayload extends Partial<CreateEmployeePayload> {
  status?: InternalTeamEmployeeStatus;
}

export const ACCESS_OPTIONS: { label: string; value: InternalTeamAccess }[] = [
  { label: 'Super Admin', value: 'SUPER_ADMIN' },
  { label: 'Relationship Manager', value: 'RELATIONSHIP_MANAGER' },
  { label: 'Operations', value: 'OPERATIONS' },
];

export const STATUS_OPTIONS: {
  label: string;
  value: InternalTeamEmployeeStatus;
}[] = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'On Leave', value: 'ON_LEAVE' },
  { label: 'Inactive', value: 'INACTIVE' },
];

export function accessLabel(access: InternalTeamAccess): string {
  return ACCESS_OPTIONS.find((o) => o.value === access)?.label ?? access;
}

export function statusLabel(status: InternalTeamEmployeeStatus): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export interface EmployeeDetailResponse {
  data: InternalTeamEmployee & {
    // Server surfaces the soft-delete state on the detail response too
    // so the profile page can render read-only with a deactivation
    // callout instead of 404'ing on deactivated rows.
    isDeactivated: boolean;
    deactivatedAt: string | null;
  };
  viewerAccess: InternalTeamAccess | null;
  /** True when the viewer is looking at their own profile. */
  isSelf: boolean;
}

export type AssignedClientStatus = 'ACTIVE' | 'DEACTIVATED';

export interface AssignedClient {
  id: string;
  legalName: string;
  industry: string | null;
  industryLabel: string;
  activeCasesCount: number;
  status: AssignedClientStatus;
}

export interface AssignedClientsMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface AssignedClientsResponse {
  data: AssignedClient[];
  meta: AssignedClientsMeta;
}

export const ASSIGNED_CLIENT_STATUS_OPTIONS: {
  label: string;
  value: AssignedClientStatus;
}[] = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Deactivated', value: 'DEACTIVATED' },
];
