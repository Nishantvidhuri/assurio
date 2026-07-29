// Wire shape of an InternalUserActivity row as returned by
// GET /v1/internal/team/:id/recent-activity. Mirror of the server's
// ActivityListItem in InternalUserActivityService.
export type EmployeeActivityEventType =
  | 'CLIENT_ADDED'
  | 'CLIENT_ACTIVATED'
  | 'CLIENT_DEACTIVATED'
  | 'CLIENT_EDITED'
  | 'CLIENT_ONBOARDING_FORM_SENT'
  | 'CLIENT_ACTIVATION_EMAIL_SENT'
  | 'CLIENT_PACKAGE_CONFIGURED'
  | 'CLIENT_CREDITS_ADDED'
  | 'CLIENT_INVOICE_CREATED'
  | 'CLIENT_USER_ADDED'
  | 'VERIFICATION_CHECK_STATUS_CHANGED'
  | 'VERIFICATION_CHECK_COMMENT_ADDED'
  | 'VERIFICATION_CALL_EXCEPTION_SCHEDULED'
  | 'VERIFICATION_CALL_JOINED'
  | 'VERIFICATION_CALL_MISSED'
  | 'VERIFICATION_CALL_ASSIGNED'
  | 'VERIFICATION_CALL_VERIFIER_REASSIGNED'
  | 'SUPPORT_TICKET_CLOSED'
  | 'CLIENT_PACKAGE_EDITED'
  | 'CLIENT_PRICING_UPDATED'
  | 'BASE_PACKAGE_UPDATED'
  | 'BASE_CHECK_UPDATED';

export interface EmployeeActivityRow {
  id: string;
  eventType: EmployeeActivityEventType;
  description: string;
  clientId: string | null;
  candidateCaseId: string | null;
  candidateCheckId: string | null;
  appointmentId: string | null;
  createdAt: string;
}

export interface EmployeeActivityResponse {
  items: EmployeeActivityRow[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

// High-level module each event belongs to. Shown in the "Type" column
// (instead of the specific event verb) and used as the filter options.
// Keep the union narrow so the filter chip stays compact — when a new
// event lands, add its enum to the right module rather than introducing
// a new module.
export type EmployeeActivityModule =
  | 'Client'
  | 'Verification Queue'
  | 'Verification Calls'
  | 'Support'
  | 'Packages & Checks';

const EVENT_TYPE_TO_MODULE: Record<
  EmployeeActivityEventType,
  EmployeeActivityModule
> = {
  CLIENT_ADDED: 'Client',
  CLIENT_ACTIVATED: 'Client',
  CLIENT_DEACTIVATED: 'Client',
  CLIENT_EDITED: 'Client',
  CLIENT_ONBOARDING_FORM_SENT: 'Client',
  CLIENT_ACTIVATION_EMAIL_SENT: 'Client',
  CLIENT_PACKAGE_CONFIGURED: 'Client',
  CLIENT_PACKAGE_EDITED: 'Client',
  CLIENT_PRICING_UPDATED: 'Client',
  CLIENT_CREDITS_ADDED: 'Client',
  CLIENT_INVOICE_CREATED: 'Client',
  CLIENT_USER_ADDED: 'Client',
  VERIFICATION_CHECK_STATUS_CHANGED: 'Verification Queue',
  VERIFICATION_CHECK_COMMENT_ADDED: 'Verification Queue',
  VERIFICATION_CALL_EXCEPTION_SCHEDULED: 'Verification Calls',
  VERIFICATION_CALL_JOINED: 'Verification Calls',
  VERIFICATION_CALL_MISSED: 'Verification Calls',
  VERIFICATION_CALL_ASSIGNED: 'Verification Calls',
  VERIFICATION_CALL_VERIFIER_REASSIGNED: 'Verification Calls',
  SUPPORT_TICKET_CLOSED: 'Support',
  BASE_PACKAGE_UPDATED: 'Packages & Checks',
  BASE_CHECK_UPDATED: 'Packages & Checks',
};

export function moduleForEvent(
  type: EmployeeActivityEventType,
): EmployeeActivityModule {
  return EVENT_TYPE_TO_MODULE[type];
}

// Inverse map — used to translate a picked module filter back to the
// list of event types the server should filter by. Built once at module
// load; iterating the source map keeps the two in sync without manual
// duplication.
export const EVENT_TYPES_BY_MODULE: Record<
  EmployeeActivityModule,
  EmployeeActivityEventType[]
> = (() => {
  const map: Record<EmployeeActivityModule, EmployeeActivityEventType[]> = {
    Client: [],
    'Verification Queue': [],
    'Verification Calls': [],
    Support: [],
    'Packages & Checks': [],
  };
  for (const [event, mod] of Object.entries(EVENT_TYPE_TO_MODULE) as Array<
    [EmployeeActivityEventType, EmployeeActivityModule]
  >) {
    map[mod].push(event);
  }
  return map;
})();

// Filter chip options — one entry per MODULE (4 entries), not one per
// specific event. Matches the column-display granularity so the filter
// is "show me Client activity / Support activity" rather than the
// 16-deep event-by-event picker.
export const EMPLOYEE_ACTIVITY_MODULE_OPTIONS: Array<{
  label: string;
  value: EmployeeActivityModule;
}> = (Object.keys(EVENT_TYPES_BY_MODULE) as EmployeeActivityModule[])
  .map((m) => ({ label: m, value: m }))
  .sort((a, b) => a.label.localeCompare(b.label));
