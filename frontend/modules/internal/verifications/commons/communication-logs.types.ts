// Shape of a Communication Log row in the verification queue's
// per-check section (Education + Employment for now). Stays in sync
// with the existing case-activity logs table once the "Push to logs"
// API lands.

export type CommunicationLogStatusTagVariant =
  | 'Default'
  | 'Primary'
  | 'Warning'
  | 'Success'
  | 'Info'
  | 'Failure';

// Which check-type a list applies to. Drives the Role/Designation
// dropdown content AND the per-status sub-form copy.
export type CommunicationLogCheckType = 'employment' | 'education';

export interface CommunicationLogModeOption {
  key: string;
  label: string;
  acceptsCustomValue?: boolean;
}

export interface CommunicationLogRoleOption {
  key: string;
  label: string;
  acceptsCustomValue?: boolean;
}

export interface CommunicationLogStatusOption {
  key: string;
  label: string;
  tagVariant: CommunicationLogStatusTagVariant;
}

export interface CommunicationLogCheckFieldOption {
  key: string;
  label: string;
}

export interface CommunicationLogReasonOption {
  key: string;
  label: string;
  acceptsCustomValue?: boolean;
}

// One row in the "Confirmed with Discrepancy" sub-form table. `type`
// captures whether the source had no record matching that field
// (`no_match`) or stated a value different from the candidate's
// (`stated`); `statedValue` is only meaningful for the `stated` case.
export interface CommunicationLogDiscrepancyRow {
  fieldKey: string;
  type: 'no_match' | 'stated' | null;
  statedValue: string;
}

// One row in the "Refuse to disclose" sub-form table — captures the
// field the source declined to disclose plus the rationale. When
// `reasonKey` resolves to the curated "Other" entry the verifier
// types the rationale into `reasonOther`.
export interface CommunicationLogRefusedFieldRow {
  fieldKey: string;
  reasonKey: string;
  reasonIsOther: boolean;
  reasonOther: string;
}

// Server-owned intake-config for the dialog dropdowns. Fetched once
// per session via `GET /v1/internal/verifications/communication-logs/intake-config`.
export interface CommunicationLogsIntakeConfig {
  modes: CommunicationLogModeOption[];
  rolesByCheckType: Record<
    CommunicationLogCheckType,
    CommunicationLogRoleOption[]
  >;
  statuses: CommunicationLogStatusOption[];
  checkFieldsByCheckType: Record<
    CommunicationLogCheckType,
    CommunicationLogCheckFieldOption[]
  >;
  couldNotConfirmReasons: CommunicationLogReasonOption[];
  refuseToDiscloseReasons: CommunicationLogReasonOption[];
}

// Persisted log row.
export interface CommunicationLog {
  id: string;
  mode: string;
  modeOther: string | null;
  communicationDate: string;
  roleDesignation: string;
  roleDesignationIsOther: boolean;
  company: string;
  companyIsOther: boolean;
  status: string;
  // Per-status structured extras. The Description shown in each
  // sub-form is composed CLIENT-SIDE from these fields rather than
  // captured as free text — keeps the registered-logs view rendering
  // identical to what the verifier saw at save time.
  confirmedFieldKeys?: string[];
  pendingFieldKeys?: string[];
  discrepancyRows?: CommunicationLogDiscrepancyRow[];
  // For `could_not_confirm`: key from intake-config's
  // couldNotConfirmReasons (or the verbatim "Other" text when the
  // verifier picked the custom-value entry).
  reason?: string;
  reasonIsOther?: boolean;
  // For `refuse_to_disclose`: per-field decline rows.
  refusedRows?: CommunicationLogRefusedFieldRow[];
  // For `acknowledged_will_revert`: ISO date string OR null when the
  // source didn't share an expected revert date. `revertDateNotShared`
  // distinguishes "no date provided" from "not yet captured".
  expectedRevertDate?: string | null;
  revertDateNotShared?: boolean;
  pushedToLogsAt: string | null;
}
