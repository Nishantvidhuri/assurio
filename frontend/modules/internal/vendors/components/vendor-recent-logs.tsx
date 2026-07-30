import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  type StatusVariant,
} from '@/shared/components/ui';
import { httpStatusTone } from '../commons/internal-vendors.constants';
import type {
  VendorCode,
  VendorRecentCall,
} from '../commons/internal-vendors.types';

// HTTP-status tone → RDS status-chip variant.
const HTTP_TONE_VARIANT: Record<'success' | 'error' | 'neutral', StatusVariant> =
  {
    success: 'Success',
    error: 'Failure',
    neutral: 'Default',
  };

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

interface VendorRecentLogsProps {
  code: VendorCode;
  calls: VendorRecentCall[];
}

export function VendorRecentLogs({ code, calls }: VendorRecentLogsProps) {
  return (
    <div className="flex flex-col gap-4 overflow-hidden rounded-lg border border-border-default bg-white px-5 pt-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-body">API Logs</h2>
        <Link
          href={`/admin/vendors/logs?vendor=${code}`}
          className="text-sm font-medium text-text-link hover:text-text-link-hover hover:underline"
        >
          View logs
        </Link>
      </div>
      {/* Bleed the table to the card edges (edge-to-edge grey header per
          Figma); first/last cells re-pad to line up with the card's content.
          Drop the final row's divider so the bottom reads as seamless too. */}
      <div className="-mx-5">
        <Table>
          <TableHeader>
            <TableRow hoverable={false}>
              <TableHeaderCell className="pl-5" type="default" label="Capability" />
              <TableHeaderCell type="default" label="Time" />
              <TableHeaderCell className="pr-5" type="default" label="HTTP" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {calls.length === 0 ? (
              <TableRow hoverable={false}>
                <td
                  colSpan={3}
                  className="border-b border-border-default p-6 text-center text-body-md text-text-disabled"
                >
                  No recent calls.
                </td>
              </TableRow>
            ) : (
              calls.map((call) => (
                <TableRow key={call.id}>
                  <TableCell
                    className="pl-5"
                    type="default"
                    value={call.capabilityLabel}
                  />
                  <TableCell
                    type="default"
                    value={formatTime(call.createdAt)}
                  />
                  <TableCell
                    className="pr-5"
                    type="status"
                    statusLabel={
                      call.httpStatusCode != null
                        ? String(call.httpStatusCode)
                        : '—'
                    }
                    statusVariant={
                      HTTP_TONE_VARIANT[
                        httpStatusTone(call.httpStatusCode, call.success)
                      ]
                    }
                  />
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
