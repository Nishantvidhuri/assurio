'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Pagination } from '@/shared/components/ui';
import {
  FilterRow,
  DateFilterChip,
  type FilterRowItem,
  type DateRangeValue,
} from '@/shared/components/ui/filter';
import { ApiCallLogsTable } from './api-call-logs-table';
import {
  CALL_OUTCOME_OPTIONS,
  ENDPOINT_FILTER_OPTIONS,
  HTTP_CLASS_OPTIONS,
  HTTP_METHOD_OPTIONS,
  VENDOR_FILTER_OPTIONS,
} from '../commons/internal-vendors.constants';
import type { VendorCallLogResponse } from '../commons/internal-vendors.types';

interface ApiCallLogsProps {
  response: VendorCallLogResponse;
  page: number;
  pageSize: number;
}

function readMulti(searchParams: URLSearchParams, key: string): string[] {
  const value = searchParams.get(key);
  return value ? value.split(',').filter(Boolean) : [];
}

export function ApiCallLogs({ response, page, pageSize }: ApiCallLogsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateUrlParams = (
    updates: Record<string, string | number>,
    resetPage = true,
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === '' || value === undefined) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    }
    if (resetPage) {
      params.set('page', '1');
    }
    router.replace(`?${params.toString()}`);
  };

  const filters: FilterRowItem[] = [
    {
      id: 'vendor',
      label: 'Vendor',
      options: VENDOR_FILTER_OPTIONS,
      selectedValues: readMulti(searchParams, 'vendor'),
      onSelectionChange: (values) =>
        updateUrlParams({ vendor: values.join(',') }),
    },
    {
      id: 'method',
      label: 'Method',
      options: HTTP_METHOD_OPTIONS,
      selectedValues: readMulti(searchParams, 'method'),
      onSelectionChange: (values) =>
        updateUrlParams({ method: values.join(',') }),
    },
    {
      id: 'endpoint',
      label: 'Endpoint',
      options: ENDPOINT_FILTER_OPTIONS,
      selectedValues: readMulti(searchParams, 'endpoint'),
      onSelectionChange: (values) =>
        updateUrlParams({ endpoint: values.join(',') }),
      menuMaxHeight: 360,
    },
    {
      id: 'httpClass',
      label: 'HTTP',
      options: HTTP_CLASS_OPTIONS,
      selectedValues: readMulti(searchParams, 'httpClass'),
      onSelectionChange: (values) =>
        updateUrlParams({ httpClass: values.join(',') }),
    },
    {
      id: 'outcome',
      label: 'Outcome',
      options: CALL_OUTCOME_OPTIONS,
      selectedValues: searchParams.get('outcome')
        ? [searchParams.get('outcome')!]
        : [],
      onSelectionChange: (values) =>
        updateUrlParams({ outcome: values[values.length - 1] ?? '' }),
    },
  ];

  // Date range uses the backend's `from`/`to` (ISO) params, which the page
  // already passes through. Both bounds must be present to form a range.
  const dateFrom = searchParams.get('from');
  const dateTo = searchParams.get('to');
  const dateRangeValue: DateRangeValue | null =
    dateFrom && dateTo
      ? { from: new Date(dateFrom), to: new Date(dateTo) }
      : null;

  return (
    <div className="flex flex-col gap-6">
      <FilterRow
        filters={filters}
        hasExtraActiveFilters={!!dateRangeValue}
        onClearAll={() =>
          updateUrlParams({
            vendor: '',
            method: '',
            endpoint: '',
            httpClass: '',
            outcome: '',
            from: '',
            to: '',
          })
        }
      >
        <DateFilterChip
          value={dateRangeValue}
          onChange={(range) => {
            if (!range) {
              updateUrlParams({ from: '', to: '' });
              return;
            }
            updateUrlParams({
              from: range.from.toISOString(),
              to: range.to.toISOString(),
            });
          }}
          label="Date Range"
          align="end"
        />
      </FilterRow>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium text-text-subheading">
          Showing <span className="text-text-body">{response.data.length}</span>{' '}
          out of <span className="text-text-body">{response.meta.totalItems}</span>
        </p>
        <ApiCallLogsTable calls={response.data} />
        <div className="mt-2">
          <Pagination
            currentPage={page}
            totalPages={response.meta.totalPages}
            pageSize={pageSize}
            onPageChange={(nextPage) =>
              updateUrlParams({ page: nextPage }, false)
            }
            onPageSizeChange={(nextSize) =>
              updateUrlParams({ page: 1, pageSize: nextSize }, false)
            }
          />
        </div>
      </div>
    </div>
  );
}
