import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@/shared/components/ui';
import type { VendorCapabilityRow } from '../commons/internal-vendors.types';

interface VendorCapabilitiesTableProps {
  capabilities: VendorCapabilityRow[];
}

export function VendorCapabilitiesTable({
  capabilities,
}: VendorCapabilitiesTableProps) {
  return (
    <div className="flex flex-col gap-4 overflow-hidden rounded-lg border border-border-default bg-white px-5 pt-5">
      <h2 className="text-base font-semibold text-text-body">Capabilities</h2>
      {/* Bleed the table to the card edges (edge-to-edge grey header per
          Figma); first/last cells re-pad to line up with the card's content.
          Drop the final row's divider so the bottom reads as seamless too. */}
      <div className="-mx-5">
        <Table>
          <TableHeader>
            <TableRow hoverable={false}>
              <TableHeaderCell className="pl-5" type="default" label="Capability" />
              <TableHeaderCell type="default" label="API" />
              <TableHeaderCell type="default" label="Routing" />
              <TableHeaderCell
                className="[&>div]:justify-end"
                type="number"
                label="Cost"
              />
              <TableHeaderCell
                className="pr-5 [&>div]:justify-end"
                type="number"
                label="Calls (MTD)"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {capabilities.map((capability) => (
              <TableRow key={capability.code}>
                <TableCell
                  className="pl-5"
                  type="default"
                  value={capability.displayName}
                />
                <TableCell
                  type="default"
                  value={
                    <span className="font-mono text-xs text-text-subheading">
                      {capability.code}
                    </span>
                  }
                />
                <TableCell
                  type="default"
                  value={capability.role === 'PRIMARY' ? 'Primary' : 'Fallback'}
                />
                <TableCell type="number" value={capability.unitCost ?? '—'} />
                <TableCell
                  className="pr-5"
                  type="number"
                  value={
                    capability.callsMtd != null
                      ? capability.callsMtd.toLocaleString('en-IN')
                      : '—'
                  }
                />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
