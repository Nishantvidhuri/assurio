'use client';

/**
 * Recriauth-style verification check card: a collapsible section with a header
 * (title + status tag + "TAT: …" badge + chevron) and a body that shows the
 * check's Status, ID number, Documents, an optional readout, and a
 * "Field comparison" table (Field / Candidate said / Data found / Match).
 * Read-only — no verifier editing.
 */
import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, Eye, Mail, RefreshCw, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  Tag,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@/shared/components/ui';

export type CheckStatus =
  | 'done'
  | 'in-progress'
  | 'pending'
  | 'unavailable'
  | 'failed';
export type MatchVariant = 'match' | 'partial' | 'mismatch' | 'na';

export interface ComparisonRow {
  key: string;
  label: string;
  candidateSaid: string | null;
  dataFound: string | null;
  match?: MatchVariant;
}

export interface CheckDocument {
  name: string;
  url: string;
  contentType?: string;
}

export interface RequiredInput {
  label: string;
  /** The candidate's entered value, or empty/undefined if not provided. */
  value?: string | null;
}

const STATUS_TAG: Record<
  CheckStatus,
  {
    variant: 'Success' | 'Warning' | 'Default' | 'Primary' | 'Failure' | 'Info';
    label: string;
  }
> = {
  done: { variant: 'Success', label: 'Completed' },
  // Light blue "In progress" — matches the report's badge (#e8edf8 / #174ab5).
  'in-progress': { variant: 'Info', label: 'In progress' },
  // Details are present — the check is queued / awaiting its result. We surface
  // this as "In progress" too (no separate "Pending" state shown to users).
  pending: { variant: 'Info', label: 'In progress' },
  // The required details weren't provided, so this check can't run.
  unavailable: { variant: 'Default', label: 'Not provided' },
  // The vendor ran the check and returned an invalid / not-found result.
  failed: { variant: 'Failure', label: 'Failed' },
};

const MATCH_TAG: Record<
  MatchVariant,
  { variant: 'Success' | 'Warning' | 'Failure' | 'Default'; label: string }
> = {
  match: { variant: 'Success', label: 'Match' },
  partial: { variant: 'Warning', label: 'Partial' },
  mismatch: { variant: 'Failure', label: 'Mismatch' },
  na: { variant: 'Default', label: 'Not provided' },
};

/** TAT indicator — neutral box with the soft blue radial glow, per Recriauth. */
function TatBadge({ label }: { label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-md border border-border-default px-2.5 py-0.5',
        'bg-[radial-gradient(ellipse_at_bottom_right,#cddef4_0%,#e8edf8_42%,#f9fbff_78%)]',
        'text-[12px] leading-5 tracking-[0.25px] text-text-body',
      )}
    >
      <span className="font-bold">TAT:</span>
      <span className="ml-1 font-medium">{label}</span>
    </span>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-text-subheading">
      {children}
    </div>
  );
}

export function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  const showMatch = rows.some((r) => r.match);
  return (
    <Table bordered className="bg-white">
      <TableHeader>
        <TableRow hoverable={false}>
          <TableHeaderCell label="Field" className="min-w-[160px]" />
          <TableHeaderCell label="Candidate said" />
          <TableHeaderCell label="Data found" />
          {showMatch && (
            <TableHeaderCell label="Match" className="min-w-[120px]" />
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key} hoverable={false}>
            <TableCell
              value={
                <span className="font-medium text-text-body">{r.label}</span>
              }
            />
            <TableCell value={r.candidateSaid?.trim() || '—'} />
            <TableCell value={r.dataFound?.trim() || '—'} />
            {showMatch && (
              <TableCell
                value={
                  r.match && r.match !== 'na' ? (
                    <Tag
                      variant={MATCH_TAG[r.match].variant}
                      label={MATCH_TAG[r.match].label}
                    />
                  ) : (
                    <span className="text-text-placeholder">—</span>
                  )
                }
              />
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function CheckCard({
  title,
  status,
  tat,
  idNumber,
  documents,
  comparison,
  children,
  defaultOpen = false,
  onPreview,
  onRecall,
  recalling = false,
  onResend,
  resending = false,
  requirements,
  order,
}: {
  title: string;
  status: CheckStatus;
  tat?: string;
  idNumber?: string | null;
  documents?: CheckDocument[];
  comparison?: ComparisonRow[];
  children?: ReactNode;
  defaultOpen?: boolean;
  onPreview?: (doc: CheckDocument) => void;
  /** When provided, a "Recall API" button re-runs this check. */
  onRecall?: () => void;
  recalling?: boolean;
  /** When provided, a "Resend email" button re-sends the candidate link (used
   *  for candidate-driven checks like Aadhaar/DigiLocker instead of Recall). */
  onResend?: () => void;
  resending?: boolean;
  /** Inputs this check needs, with the candidate's entered value (if any). */
  requirements?: RequiredInput[];
  /** CSS flex order — used to push "Not provided" cards to the bottom. */
  order?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const st = STATUS_TAG[status];
  const reqs = requirements ?? [];
  // Recall can only run once every required input the candidate must provide
  // is present.
  const canRecall = reqs.every((r) => Boolean(r.value && r.value.trim()));
  const hasBody =
    Boolean(children) ||
    Boolean(idNumber) ||
    Boolean(onRecall) ||
    Boolean(onResend) ||
    reqs.length > 0 ||
    (documents?.length ?? 0) > 0 ||
    (comparison?.length ?? 0) > 0;

  return (
    <section
      style={order !== undefined ? { order } : undefined}
      className={cn(
        'overflow-hidden rounded-xl border bg-white transition-colors',
        open ? 'border-border-focused' : 'border-border-default',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left"
      >
        <span className="text-base font-semibold text-text-heading">
          {title}
        </span>
        <Tag variant={st.variant} label={st.label} />
        <span className="ml-auto flex items-center gap-3">
          {tat && <TatBadge label={tat} />}
          <ChevronDown
            size={18}
            className={cn(
              'shrink-0 text-icon-default transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </span>
      </button>

      {open && hasBody && (
        <div className="space-y-5 border-t border-border-default px-5 py-5">
          {/* Status + Recall */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <FieldLabel>Status</FieldLabel>
              <Tag variant={st.variant} label={st.label} />
            </div>
            {onResend ? (
              <button
                type="button"
                onClick={onResend}
                disabled={resending}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-default bg-white px-3 py-1.5 text-body-sm font-medium text-text-body transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Mail size={14} className={resending ? 'animate-pulse' : ''} />
                {resending ? 'Sending…' : 'Resend email'}
              </button>
            ) : onRecall ? (
              <button
                type="button"
                onClick={onRecall}
                disabled={recalling || !canRecall}
                title={
                  canRecall
                    ? undefined
                    : 'Fill the required inputs before re-running this check'
                }
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-default bg-white px-3 py-1.5 text-body-sm font-medium text-text-body transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  size={14}
                  className={recalling ? 'animate-spin' : ''}
                />
                {recalling ? 'Recalling…' : 'Recall API'}
              </button>
            ) : null}
          </div>

          {/* Required inputs — what the candidate must provide for this check. */}
          {reqs.length > 0 && (
            <div>
              <FieldLabel>Required inputs</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {reqs.map((r) => {
                  const filled = Boolean(r.value && r.value.trim());
                  return (
                    <span
                      key={r.label}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-body-sm',
                        filled
                          ? 'border-border-success bg-surface-success text-success'
                          : 'border-border-default bg-neutral-100 text-text-subheading',
                      )}
                    >
                      {filled ? (
                        <Check size={13} className="shrink-0" />
                      ) : (
                        <X size={13} className="shrink-0" />
                      )}
                      {r.label}
                      {filled && r.value ? (
                        <span className="font-medium">· {r.value}</span>
                      ) : (
                        <span className="opacity-70">· not provided</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {idNumber && (
            <div>
              <FieldLabel>ID Number</FieldLabel>
              <div className="text-body-md text-text-heading">{idNumber}</div>
            </div>
          )}

          {documents && documents.length > 0 && (
            <div>
              <FieldLabel>Documents</FieldLabel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {documents.map((doc, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onPreview?.(doc)}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-neutral-100 px-3.5 py-3 text-left transition-colors hover:bg-neutral-200"
                  >
                    <span
                      className="min-w-0 flex-1 truncate text-body-sm font-medium text-text-body"
                      title={doc.name}
                    >
                      {doc.name}
                    </span>
                    <Eye size={16} className="shrink-0 text-icon-default" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {children}

          {comparison && comparison.length > 0 && (
            <div>
              <div className="mb-3 text-base font-semibold text-text-heading">
                Field comparison
              </div>
              <ComparisonTable rows={comparison} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
