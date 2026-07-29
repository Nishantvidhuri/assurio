/**
 * Shapes mirror the server's dashboard DTOs in
 * server/src/modules/client/dashboard/commons/dashboard.types.ts.
 * Keep them in sync when the backend adds fields.
 */

export type DashboardMetricKey =
  | 'total'
  | 'pending'
  | 'inProgress'
  | 'onHold'
  | 'completed';

export type DashboardTrendBucket = 'day' | 'week' | 'month';

export interface DashboardRange {
  from: string;
  to: string;
}

export interface DashboardMetricValue {
  key: DashboardMetricKey;
  value: number;
  previousValue: number;
}

export interface DashboardMetricsPayload {
  range: DashboardRange;
  comparisonRange: DashboardRange;
  metrics: DashboardMetricValue[];
}

export interface DashboardTrendPoint {
  bucketStart: string;
  value: number;
  previousValue: number;
}

export interface DashboardTrendPayload {
  range: DashboardRange;
  comparisonRange: DashboardRange;
  bucket: DashboardTrendBucket;
  points: DashboardTrendPoint[];
}

export interface DashboardDistributionSlice {
  label: string;
  value: number;
}

export interface DashboardDistributionPayload {
  range: DashboardRange;
  total: number;
  slices: DashboardDistributionSlice[];
}

export interface DashboardInsufficiencyItem {
  candidateCaseId: string;
  candidateName: string;
  checkName: string;
  detail: string;
  raisedAt: string;
}

export interface DashboardInsufficienciesPayload {
  items: DashboardInsufficiencyItem[];
  /** Opaque cursor for the next page, or null if the feed is exhausted. */
  nextCursor: string | null;
  /**
   * Total active insufficiencies for the org. Populated only on the first
   * page (request without cursor). Absent on paginated follow-ups so the
   * count query is skipped.
   */
  totalCount?: number;
}

export interface DashboardCombinedPayload {
  metrics: DashboardMetricsPayload;
  trend: DashboardTrendPayload;
  distribution: DashboardDistributionPayload;
  insufficiencies: DashboardInsufficienciesPayload;
  viewerName: string;
}
