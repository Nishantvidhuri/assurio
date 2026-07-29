export type SupportAudience = 'CLIENT' | 'INTERNAL';

export type SupportTicketStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_USER'
  | 'RESOLVED'
  | 'CLOSED';

export type SupportTicketPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type SupportTicketCategory =
  | 'DOCUMENT'
  | 'VERIFICATION'
  | 'PORTAL_ACCESS'
  | 'BILLING'
  | 'CANDIDATE_IMPORT'
  | 'CONSENT_FORM'
  | 'OTHER';

export type SupportMessageVisibility = 'PUBLIC' | 'INTERNAL_ONLY';

export interface SupportSubCategoryOption {
  /** Stable identifier sent to the backend as `subCategoryKey`. */
  key: string;
  /** Human-readable label shown in the dropdown. */
  label: string;
  /** Fixed priority this subcategory assigns to new tickets. */
  priority: SupportTicketPriority;
  /** SLA commitment for first response, in minutes (derived from priority). */
  slaFirstResponseMinutes: number;
  /** SLA commitment for full resolution, in minutes. */
  slaResolutionMinutes: number;
}

export interface SupportCategoryOption {
  /** Stable identifier sent to the backend as `categoryKey`. */
  key: string;
  /** Human-readable label shown in the dropdown. */
  label: string;
  /** Coarse routing enum the server stores in `category`. */
  backendCategory: SupportTicketCategory;
  subCategories: SupportSubCategoryOption[];
}

export interface SupportIntakeConfigResponse {
  categories: SupportCategoryOption[];
}

export type SupportInternalIntakeConfigResponse = SupportIntakeConfigResponse;

export interface SupportTicketListItem {
  id: string;
  ticketNumber: string;
  organizationId: string;
  unreadMessageCount: number;
  category: SupportTicketCategory;
  categoryKey: string | null;
  subCategoryKey: string | null;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  subject: string;
  descriptionPreview: string | null;
  isOverdueFirstResponse: boolean;
  isOverdueResolution: boolean;
  requester: {
    id: string;
    userType: 'INTERNAL' | 'CLIENT';
    name: string;
    email: string;
  };
  assignee: {
    id: string;
    name: string;
    email: string;
  } | null;
  organization: {
    id: string;
    legalName: string;
    brandName: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
}

export interface SupportAttachmentItem {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  isInlinePreviewable: boolean;
}

export interface SupportMessageItem {
  id: string;
  sender: {
    id: string;
    userType: 'INTERNAL' | 'CLIENT';
    displayName: string;
  };
  visibility: SupportMessageVisibility;
  bodyText: string;
  createdAt: string;
  attachments: SupportAttachmentItem[];
}

export interface SupportTicketDetail extends SupportTicketListItem {
  source: 'WIDGET' | 'PORTAL';
  requesterUserType: 'INTERNAL' | 'CLIENT';
  resolutionSummary: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  firstRespondedAt: string | null;
  messages: SupportMessageItem[];
}

export interface SupportTicketListResponse {
  items: SupportTicketListItem[];
  nextCursor: string | null;
}

export interface SupportTicketDetailResponse {
  ticket: SupportTicketDetail;
}

export interface SupportTicketReadStateResponse {
  ticketId: string;
  unreadMessageCount: number;
}

export interface SupportQueueSummary {
  total: number;
  open: number;
  inProgress: number;
  waitingForUser: number;
  overdue: number;
  unassigned: number;
  assignableUsers: Array<{
    id: string;
    name: string;
    email: string;
  }>;
}

export interface SupportTicketListQuery {
  cursor?: string | null;
  limit?: number;
  status?: SupportTicketStatus[];
  priority?: SupportTicketPriority[];
  category?: SupportTicketCategory[];
  categoryKey?: string[];
  requesterUserId?: string[];
  assigneeUserId?: string[];
  organizationId?: string;
  overdueOnly?: boolean;
  search?: string;
}

export interface SupportClientSummary {
  openCount: number;
  closedCount: number;
  requesters: Array<{
    id: string;
    name: string;
    email: string;
  }>;
}

export const INTERNAL_SUPPORT_CLIENT_SORT_FIELDS = [
  'clientName',
  'totalTickets',
  'openTickets',
  'waitingOnClient',
  'inProgress',
  'overdue',
] as const;

export type InternalSupportClientSortField =
  (typeof INTERNAL_SUPPORT_CLIENT_SORT_FIELDS)[number];

export type InternalSupportClientSortOrder = 'asc' | 'desc';

export interface InternalSupportClientListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: InternalSupportClientSortField;
  sortOrder?: InternalSupportClientSortOrder;
}

export interface InternalSupportClientListItem {
  id: string;
  legalName: string;
  brandName: string | null;
  totalTickets: number;
  openTickets: number;
  waitingOnClient: number;
  inProgress: number;
  overdue: number;
}

export interface InternalSupportClientListResponse {
  data: InternalSupportClientListItem[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

/** Internal admin per-client drill-down summary. Inherits the
 * `SupportClientSummary` shape so it can flow through the same
 * `clientSummary` slot in `useSupportCenter` for both audiences, plus the
 * org metadata the drill-down page header needs. */
export interface InternalSupportClientSummary extends SupportClientSummary {
  organization: {
    id: string;
    legalName: string;
    brandName: string | null;
  };
}

export interface CreateSupportTicketInput {
  /** Top-level category key from the server's `SUPPORT_CATEGORIES` catalog. */
  categoryKey: string;
  /** Subcategory key belonging to the chosen category. */
  subCategoryKey: string;
  source?: 'WIDGET' | 'PORTAL';
  subject: string;
  description: string;
  attachmentDocumentIds?: string[];
}

export interface CreateSupportMessageInput {
  visibility?: SupportMessageVisibility;
  bodyText: string;
  attachmentDocumentIds?: string[];
}

export interface UpdateSupportTicketInput {
  status?: SupportTicketStatus;
  assignedToUserId?: string | null;
  resolutionSummary?: string | null;
}

export interface SupportAttachmentUploadIntent {
  uploadSessionId: string;
  documentId: string;
  documentVersionId: string;
  category: string;
  mode: string;
  uploadUrl?: string;
  expiresAt: string;
  key: string;
  requiredHeaders?: Record<string, string>;
}

export interface SupportAttachmentDownloadResponse {
  documentId: string;
  documentVersionId: string;
  downloadUrl: string;
  expiresInSeconds: number;
  fileName: string;
  mimeType: string;
}

export interface SupportSsePayload {
  ticketId: string;
  organizationId?: string;
  messageId?: string;
  emittedAt: string;
}

export interface SupportReadStateSsePayload {
  ticketId: string;
  unreadMessageCount: number;
  emittedAt: string;
}

export const SUPPORT_TICKET_CREATED_EVENT = 'support:ticket-created';
export const SUPPORT_TICKET_READ_STATE_UPDATED_EVENT =
  'support.ticket.read-state.updated';

export interface SupportPendingAttachment {
  id: string;
  file: File;
  uploadedDocumentId?: string | null;
}
