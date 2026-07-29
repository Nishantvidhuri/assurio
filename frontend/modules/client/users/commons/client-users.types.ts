import type { BulkSelectionRequest } from '@/shared/commons/bulk-selection.types';
import type { UserRole } from '@/modules/auth/commons/auth.types';

export interface ClientUser {
  id: string;
  name: string;
  email: string;
  role: UserRole | null;
  phoneNumber: string | null;
  department: string | null;
  candidatesAdded: number;
  isEmailVerified: boolean;
  createdAt: string;
  /**
   * ISO timestamp of the latest pending onboarding token's expiry. `null`
   * once the user has accepted (or once their token has expired/been
   * revoked). The table uses this to show the "Awaiting Invitation" tag,
   * the 24h countdown, and the "Resend Invitation" button.
   */
  invitationExpiresAt: string | null;
}

export interface ClientUserListMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  selectableTotalItems: number;
  activeAdminCount: number;
  lastAdminUserId: string | null;
  totalPages: number;
}

export interface ClientUserListResponse {
  data: ClientUser[];
  meta: ClientUserListMeta;
}

export interface ClientUserListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: 'name' | 'email' | 'role' | 'department' | 'createdAt' | 'candidatesAdded';
  sortOrder?: 'asc' | 'desc';
}

export interface ClientUserBulkFilters {
  search?: string;
}

export type ClientUserBulkSelectionPayload =
  BulkSelectionRequest<ClientUserBulkFilters>;

export interface CreateClientUserPayload {
  name: string;
  email: string;
  role: UserRole;
  phoneNumber?: string;
  department?: string;
}

export interface UpdateClientUserPayload {
  name?: string;
  email?: string;
  role?: UserRole;
  phoneNumber?: string;
  department?: string;
}

export interface BulkDeleteResult {
  deleted: string[];
  skipped: string[];
  deletedCount: number;
  skippedCount: number;
}
