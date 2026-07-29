// Per-case activity log DTOs — mirrors server/src/modules/case-activity/
// case-activity.types.ts.

export interface CaseActivityChangeRow {
  field: string;
  updatedBy: string;
  oldValue: string;
  newValue: string;
}

export interface CaseActivityPlatformEntry {
  id: string;
  updateType: string;
  updateArea: string;
  details: string;
  user: string;
  // ISO timestamp.
  dateTime: string;
  changes?: CaseActivityChangeRow[];
  // Present on an additional-charge "requested" row with an attached proof
  // PDF — drives the "View Document" preview link in the platform log.
  documentId?: string;
}

export interface CaseActivityEventEntry {
  id: string;
  updateArea: string;
  user: string;
  event: string;
  // Free-form so per-source events can surface a more specific label
  // — Communication-Log events emit the status label ("Partial
  // response", "Confirmed all details", "Could not confirm", …);
  // every other source still emits the canonical 'Successful' /
  // 'Failure'. UI red-text styling is gated on the failure label set
  // in verification-logs-screen, not on the literal "Failure" string.
  outcome: string;
  description: string;
  link?: string;
  dateTime: string;
}

export interface CaseActivityResponse {
  platformLogs: CaseActivityPlatformEntry[];
  eventLogs: CaseActivityEventEntry[];
  truncated: boolean;
}

export type CaseActivityTab = 'platform' | 'events' | 'vendor';

export interface CaseActivityPageMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface CaseActivityPlatformPage {
  tab: 'platform';
  candidateName: string;
  entries: CaseActivityPlatformEntry[];
  meta: CaseActivityPageMeta;
  filterOptions: {
    checkTypes: string[];
    updateAreas: string[];
    users: string[];
  };
  truncated: boolean;
}

export interface CaseActivityEventsPage {
  tab: 'events';
  candidateName: string;
  entries: CaseActivityEventEntry[];
  meta: CaseActivityPageMeta;
  filterOptions: {
    updateAreas: string[];
    users: string[];
    events: string[];
  };
  truncated: boolean;
}

// Vendor Log tab — internal-only. Same shape as the events page.
export interface CaseActivityVendorPage {
  tab: 'vendor';
  candidateName: string;
  entries: CaseActivityEventEntry[];
  meta: CaseActivityPageMeta;
  filterOptions: {
    updateAreas: string[];
    users: string[];
    events: string[];
  };
  truncated: boolean;
}

export type CaseActivityPageResponse =
  | CaseActivityPlatformPage
  | CaseActivityEventsPage
  | CaseActivityVendorPage;
