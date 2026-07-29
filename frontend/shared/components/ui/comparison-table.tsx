'use client';

import { forwardRef, type ChangeEvent } from 'react';
import { cn } from '@/shared/lib/utils';
import { MatchStatus, type MatchResult } from '@/shared/comparison';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from './table';
import { Tag, type TagProps } from './tag';
import { Input } from './input-field';

/* ═══════════════════════════════════════════════════════════════════════════
 * ComparisonTable — Field / Candidate said / Data found
 *
 * Verifier-facing comparison built on the RDS Table primitives. Used wherever
 * a check shows what the candidate submitted alongside what we independently
 * fetched (Aadhaar / PAN / Voter / Passport / DL) or independently verified
 * (Education, Employment).
 *
 * Render rules:
 *   • 3 columns, no sorting / filtering.
 *   • A 4th "Match" column appears automatically when any row carries a
 *     `match` result (from the field comparison engine); it renders a colored
 *     status Tag/chip (Match / Partial / Mismatch / Not provided).
 *   • Empty values render as em-dash "—".
 *   • Either column can be editable per row (Data-found via `editable` /
 *     `onDataFoundChange`, Candidate-said via `candidateSaidEditable` /
 *     `onCandidateSaidChange`), rendering an <Input> from input-field.tsx.
 *   • Component is presentational — parent owns values and onChange.
 * ═══════════════════════════════════════════════════════════════════════ */

export interface ComparisonTableRow {
  key: string;
  label: string;
  candidateSaid: string | null;
  dataFound: string | null;
  /** When present, the table renders the "Match" column for this row. */
  match?: MatchResult;
  // Data-found column editing.
  editable?: boolean;
  onDataFoundChange?: (next: string) => void;
  dataFoundError?: string;
  dataFoundPlaceholder?: string;
  // Candidate-said column editing (e.g. correcting OCR data on identity checks).
  candidateSaidEditable?: boolean;
  onCandidateSaidChange?: (next: string) => void;
  candidateSaidError?: string;
  candidateSaidPlaceholder?: string;
}

export interface ComparisonTableProps {
  rows: ComparisonTableRow[];
  editable?: boolean;
  bordered?: boolean;
  className?: string;
}

const formatValue = (v: string | null): string => {
  if (v === null) return '—';
  const trimmed = v.trim();
  return trimmed.length === 0 ? '—' : v;
};

// Maps a match verdict to the RDS Tag/chip variant + label shown in the Match
// column. Uses Tag (the status-chip used across the verification UI), not
// Badge. Status-only by design — the numeric score is not displayed.
const MATCH_TAG: Record<MatchStatus, { variant: TagProps['variant']; label: string }> = {
  [MatchStatus.MATCH]: { variant: 'Success', label: 'Match' },
  [MatchStatus.PARTIAL_MATCH]: { variant: 'Warning', label: 'Partial' },
  [MatchStatus.MISMATCH]: { variant: 'Failure', label: 'Mismatch' },
  [MatchStatus.NOT_PROVIDED]: { variant: 'Default', label: 'Not provided' },
};

const MatchTag = ({ match }: { match: MatchResult }) => {
  const { variant, label } = MATCH_TAG[match.status];
  return <Tag variant={variant} label={label} />;
};

// An editable comparison cell — an <Input> plus an optional inline error.
const EditableCell = ({
  value,
  placeholder,
  error,
  onChange,
}: {
  value: string | null;
  placeholder?: string;
  error?: string;
  onChange?: (next: string) => void;
}) => (
  <div className="flex flex-col gap-1">
    <Input
      value={value ?? ''}
      placeholder={placeholder}
      error={Boolean(error)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)}
    />
    {error ? (
      <span className="text-body-sm font-medium leading-[20px] tracking-body-sm text-text-error">
        {error}
      </span>
    ) : null}
  </div>
);

const ComparisonTable = forwardRef<HTMLDivElement, ComparisonTableProps>(
  ({ rows, editable = false, bordered = true, className }, ref) => {
    const showMatch = rows.some((row) => row.match);
    return (
      <Table ref={ref} bordered={bordered} className={cn(className)}>
        <TableHeader>
          <TableRow hoverable={false}>
            <TableHeaderCell
              type="default"
              label="Field"
              roundedLeft={bordered}
              className="min-w-[180px] w-[220px]"
            />
            <TableHeaderCell
              type="default"
              label="Candidate said"
              className="w-1/2"
            />
            <TableHeaderCell
              type="default"
              label="Data found"
              roundedRight={bordered && !showMatch}
              className="w-1/2"
            />
            {showMatch ? (
              <TableHeaderCell
                type="default"
                label="Match"
                roundedRight={bordered}
                className="min-w-[140px] w-[160px]"
              />
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isDataFoundEditable = row.editable ?? editable;
            return (
              <TableRow key={row.key} hoverable={false}>
                <TableCell
                  type="default"
                  value={
                    <span className="text-body-md font-medium leading-[22px] tracking-body-md text-text-body">
                      {row.label}
                    </span>
                  }
                />
                <TableCell
                  type="default"
                  value={
                    row.candidateSaidEditable ? (
                      <EditableCell
                        value={row.candidateSaid}
                        placeholder={row.candidateSaidPlaceholder}
                        error={row.candidateSaidError}
                        onChange={row.onCandidateSaidChange}
                      />
                    ) : (
                      formatValue(row.candidateSaid)
                    )
                  }
                />
                <TableCell
                  type="default"
                  value={
                    isDataFoundEditable ? (
                      <EditableCell
                        value={row.dataFound}
                        placeholder={row.dataFoundPlaceholder}
                        error={row.dataFoundError}
                        onChange={row.onDataFoundChange}
                      />
                    ) : (
                      formatValue(row.dataFound)
                    )
                  }
                />
                {showMatch ? (
                  <TableCell
                    type="default"
                    value={row.match ? <MatchTag match={row.match} /> : '—'}
                  />
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  },
);

ComparisonTable.displayName = 'ComparisonTable';

export { ComparisonTable };
