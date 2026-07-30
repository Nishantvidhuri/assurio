import {
  Table,
  TableBody,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@/shared/components/ui';

// Content-only skeleton — the shared shell (title + Overview/logs tabs + search)
// stays mounted above this while the logs load.

function SkeletonCell({ width = 'w-20' }: { width?: string }) {
  return (
    <td className="px-3 py-3">
      <div className={`h-4 ${width} rounded bg-neutral-300 animate-pulse`} />
    </td>
  );
}

function SkeletonRow() {
  return (
    <TableRow hoverable={false}>
      <SkeletonCell width="w-20" />
      <SkeletonCell width="w-28" />
      <SkeletonCell width="w-14" />
      <SkeletonCell width="w-32" />
      <SkeletonCell width="w-24" />
      <SkeletonCell width="w-40" />
      <SkeletonCell width="w-16" />
      <SkeletonCell width="w-12" />
      <SkeletonCell width="w-14" />
      <SkeletonCell width="w-16" />
      <SkeletonCell width="w-28" />
      <SkeletonCell width="w-6" />
    </TableRow>
  );
}

export function ApiCallLogsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-8 w-24 animate-pulse rounded-md bg-neutral-300"
          />
        ))}
      </div>

      <div className="h-4 w-40 animate-pulse rounded bg-neutral-300" />

      <Table>
        <TableHeader>
          <TableRow hoverable={false}>
            <TableHeaderCell type="default" label="Vendor" sortable roundedLeft />
            <TableHeaderCell type="default" label="Date & Time" sortable />
            <TableHeaderCell type="default" label="Method" />
            <TableHeaderCell type="default" label="Endpoint" />
            <TableHeaderCell type="default" label="Why it Failed" />
            <TableHeaderCell type="default" label="Description" />
            <TableHeaderCell type="default" label="Retry Status" />
            <TableHeaderCell type="default" label="HTTP" sortable />
            <TableHeaderCell type="default" label="Latency" sortable />
            <TableHeaderCell type="default" label="Case" />
            <TableHeaderCell type="default" label="Request ID" />
            <TableHeaderCell type="empty" roundedRight />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
