import {
  Table,
  TableBody,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@/shared/components/ui';

// Content-only skeleton — the shared shell (title + tabs + date filter) stays
// mounted above this while the overview data loads.

function SkeletonCell({
  width = 'w-24',
  align = 'left',
}: {
  width?: string;
  align?: 'left' | 'right';
}) {
  return (
    <td className="px-3 py-3">
      <div
        className={`h-4 ${width} rounded bg-neutral-300 animate-pulse ${
          align === 'right' ? 'ml-auto' : ''
        }`}
      />
    </td>
  );
}

export function VendorsOverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[7fr_3fr]">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-md border border-neutral-300 bg-white p-4"
              >
                <div className="h-5 w-24 animate-pulse rounded bg-neutral-300" />
                <div className="h-7 w-24 animate-pulse rounded bg-neutral-300" />
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-border-default bg-white">
            <div className="flex items-center justify-between border-b border-neutral-300 px-3 py-2.5">
              <div className="h-5 w-40 animate-pulse rounded bg-neutral-300" />
              <div className="h-5 w-32 animate-pulse rounded bg-neutral-300" />
            </div>
            <div className="px-3 pb-2.5 pt-3">
              <div className="h-[280px] w-full animate-pulse rounded-lg bg-neutral-200" />
            </div>
          </div>
        </div>

        <div className="flex h-full min-h-[280px] flex-col gap-4 rounded-md border border-border-default bg-white p-5">
          <div className="h-5 w-40 animate-pulse rounded bg-neutral-300" />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 w-full animate-pulse rounded-lg bg-neutral-200"
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-text-body">Vendors</h2>
        <Table>
          <TableHeader>
            <TableRow hoverable={false}>
              <TableHeaderCell
                type="default"
                label="Vendor"
                sortable
                roundedLeft
              />
              <TableHeaderCell type="default" label="Capabilities" />
              <TableHeaderCell type="default" label="Status" sortable />
              <TableHeaderCell type="default" label="Billing" sortable />
              <TableHeaderCell type="number" label="Avl. Balance" sortable />
              <TableHeaderCell type="number" label="Spends MTD" sortable />
              <TableHeaderCell
                type="number"
                label="Success rate"
                sortable
                roundedRight
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 4 }, (_, row) => (
              <TableRow key={row} hoverable={false}>
                <SkeletonCell width="w-24" />
                <SkeletonCell width="w-40" />
                <SkeletonCell width="w-16" />
                <SkeletonCell width="w-20" />
                <SkeletonCell width="w-16" align="right" />
                <SkeletonCell width="w-14" align="right" />
                <SkeletonCell width="w-12" align="right" />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
