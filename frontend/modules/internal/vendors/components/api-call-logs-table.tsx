'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  type StatusVariant,
} from '@/shared/components/ui';
import { useSortParams } from '@/shared/hooks/use-sort-params';
import { internalVendorsService } from '../services/internal-vendors.service';
import {
  formatLatency,
  httpStatusTone,
} from '../commons/internal-vendors.constants';
import type {
  VendorCallDetail,
  VendorCallLogItem,
} from '../commons/internal-vendors.types';

const COLUMN_COUNT = 12;

// HTTP-status tone → RDS status-chip variant.
const HTTP_TONE_VARIANT: Record<'success' | 'error' | 'neutral', StatusVariant> =
  {
    success: 'Success',
    error: 'Failure',
    neutral: 'Default',
  };

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

interface ApiCallLogsTableProps {
  calls: VendorCallLogItem[];
}

export function ApiCallLogsTable({ calls }: ApiCallLogsTableProps) {
  const { toggleSort, getSortOrder } = useSortParams();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<
    Record<string, VendorCallDetail | null>
  >({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const toggle = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!(id in detailCache)) {
      setLoadingId(id);
      try {
        const detail = await internalVendorsService.getCall(id);
        setDetailCache((cache) => ({ ...cache, [id]: detail }));
      } catch {
        setDetailCache((cache) => ({ ...cache, [id]: null }));
      } finally {
        setLoadingId(null);
      }
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow hoverable={false}>
          <TableHeaderCell
            type="default"
            label="Vendor"
            sortable
            sortOrder={getSortOrder('vendor')}
            onSort={() => toggleSort('vendor')}
            roundedLeft
          />
          <TableHeaderCell
            type="default"
            label="Date & Time"
            sortable
            sortOrder={getSortOrder('createdAt')}
            onSort={() => toggleSort('createdAt')}
          />
          <TableHeaderCell type="default" label="Method" />
          <TableHeaderCell type="default" label="Endpoint" />
          <TableHeaderCell type="default" label="Why it Failed" />
          <TableHeaderCell type="default" label="Description" />
          <TableHeaderCell type="default" label="Retry Status" />
          <TableHeaderCell
            type="default"
            label="HTTP"
            sortable
            sortOrder={getSortOrder('httpStatusCode')}
            onSort={() => toggleSort('httpStatusCode')}
          />
          <TableHeaderCell
            type="default"
            label="Latency"
            sortable
            sortOrder={getSortOrder('durationMs')}
            onSort={() => toggleSort('durationMs')}
          />
          <TableHeaderCell type="default" label="Case" />
          <TableHeaderCell type="default" label="Request ID" />
          <TableHeaderCell type="empty" roundedRight />
        </TableRow>
      </TableHeader>
      <TableBody>
        {calls.length === 0 ? (
          <TableRow hoverable={false}>
            <td
              colSpan={COLUMN_COUNT}
              className="border-b border-border-default p-6 text-center text-body-md text-text-disabled"
            >
              No API calls match these filters.
            </td>
          </TableRow>
        ) : (
          calls.map((call) => (
            <RowGroup
              key={call.id}
              call={call}
              expanded={expandedId === call.id}
              loading={loadingId === call.id}
              detail={detailCache[call.id]}
              onToggle={() => toggle(call.id)}
            />
          ))
        )}
      </TableBody>
    </Table>
  );
}

interface RowGroupProps {
  call: VendorCallLogItem;
  expanded: boolean;
  loading: boolean;
  detail: VendorCallDetail | null | undefined;
  onToggle: () => void;
}

function RowGroup({ call, expanded, loading, detail, onToggle }: RowGroupProps) {
  const router = useRouter();
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell type="default" value={call.vendorName} />
        <TableCell
          type="default"
          value={
            <span className="whitespace-nowrap text-body-md font-normal leading-[22px] tracking-body-md text-text-body">
              {formatTimestamp(call.createdAt)}
            </span>
          }
        />
        <TableCell type="default" value={call.httpMethod} />
        <TableCell
          type="default"
          value={
            <span className="font-mono text-xs text-text-body">
              {call.endpoint}
            </span>
          }
        />
        <TableCell type="default" value={call.whyFailed ?? '—'} />
        <TableCell
          className="max-w-[260px]"
          type="default"
          value={call.description}
        />
        <TableCell
          type="default"
          value={
            <span className="whitespace-nowrap text-body-md font-normal leading-[22px] tracking-body-md text-text-subheading">
              {call.retryStatus ? `${call.retryStatus} retries` : '—'}
            </span>
          }
        />
        <TableCell
          type="status"
          statusLabel={
            call.httpStatusCode != null ? String(call.httpStatusCode) : '—'
          }
          statusVariant={
            HTTP_TONE_VARIANT[httpStatusTone(call.httpStatusCode, call.success)]
          }
        />
        <TableCell
          type="default"
          value={
            <span className="whitespace-nowrap text-body-md font-normal leading-[22px] tracking-body-md text-text-body">
              {formatLatency(call.durationMs)}
            </span>
          }
        />
        <TableCell
          type="default"
          value={
            call.caseReference && call.candidateCaseId ? (
              <Button
                variant="link"
                onClick={(event) => {
                  // Don't let the case link also toggle the row's expansion.
                  event.stopPropagation();
                  // Unreachable in Recrify: caseReference/candidateCaseId are
                  // always null (no CandidateCase model), so this branch never
                  // renders. Kept for parity with the Recriauth original.
                  router.push(`/admin/subject/${call.candidateCaseId}`);
                }}
              >
                {call.caseReference}
              </Button>
            ) : (
              (call.caseReference ?? '—')
            )
          }
        />
        <TableCell
          type="default"
          value={
            <span className="whitespace-nowrap font-mono text-xs text-text-subheading">
              {call.requestId ?? '—'}
            </span>
          }
        />
        <TableCell
          type="default"
          value={
            <button
              type="button"
              aria-label={expanded ? 'Collapse row' : 'Expand row'}
              onClick={(event) => {
                // Stop the row's own onClick from firing a second toggle.
                event.stopPropagation();
                onToggle();
              }}
              className="inline-flex size-5 items-center justify-center bg-transparent text-icon-default hover:text-primary"
            >
              {expanded ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </button>
          }
        />
      </TableRow>
      {/* Always mounted so open/close can animate. The grid 0fr→1fr trick
          transitions the content height smoothly; overflow-hidden clips it and
          the inner border/background only show once expanded. */}
      <tr aria-hidden={!expanded}>
        <td colSpan={COLUMN_COUNT} className="border-0 p-0">
          <div
            className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
              expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            }`}
          >
            <div className="overflow-hidden">
              <div className="border-t border-border-default bg-neutral-50 p-4">
                {loading ? (
                  <div className="text-sm text-text-disabled">Loading…</div>
                ) : detail === null ? (
                  <div className="text-sm text-text-disabled">
                    Unable to load the vendor response for this call.
                  </div>
                ) : detail ? (
                  <pre className="max-h-80 overflow-auto rounded-lg bg-neutral-900 p-4 font-mono text-xs leading-relaxed text-neutral-100">
                    {detail.responseBody != null
                      ? JSON.stringify(detail.responseBody, null, 2)
                      : 'No response body was recorded for this call.'}
                  </pre>
                ) : null}
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}
