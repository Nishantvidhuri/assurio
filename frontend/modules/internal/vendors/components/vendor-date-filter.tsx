'use client';

import {
  DateFilterChip,
  type DateRangeValue,
} from '@/shared/components/ui/filter';

interface VendorDateFilterProps {
  value: DateRangeValue | null;
  onChange: (range: DateRangeValue | null) => void;
}

/**
 * The Vendor Management date filter — identical chip UI to the client
 * dashboard header (same props + styling) so both surfaces feel the same.
 */
export function VendorDateFilter({ value, onChange }: VendorDateFilterProps) {
  return (
    <DateFilterChip
      label="Date"
      value={value}
      onChange={onChange}
      clearable={false}
      align="end"
      showPresetLabels
      labelClassName="text-sm! font-medium!"
      className="[&>button,&>div>button]:rounded-md! [&>button,&>div>button]:border-border-hover! [&>button,&>div>button]:bg-white! [&>button,&>div>button]:h-9! [&>button,&>div>button]:px-3! [&>button,&>div>button]:py-2! [&>button,&>div>button]:gap-1!"
    />
  );
}
