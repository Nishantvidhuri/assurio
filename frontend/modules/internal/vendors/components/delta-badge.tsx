import { formatDelta } from '../commons/internal-vendors.constants';

// Same tone → token mapping as the client dashboard's DashboardMetricCard.
const TONE_CLASSES: Record<'positive' | 'negative' | 'neutral', string> = {
  positive: 'bg-surface-success text-success',
  negative: 'bg-surface-error text-failure',
  neutral: 'bg-neutral-200 text-text-subheading',
};

interface DeltaBadgeProps {
  currentValue?: number | null;
  previousValue?: number | null;
}

/**
 * Period-over-period comparison badge (client-dashboard logic). Renders
 * nothing when either value is missing, or when the change is "0%" (no change)
 * or "New" (no prior-period baseline) — both are noise.
 */
export function DeltaBadge({ currentValue, previousValue }: DeltaBadgeProps) {
  if (currentValue == null || previousValue == null) {
    return null;
  }
  const delta = formatDelta(currentValue, previousValue);
  if (delta.label === '0%' || delta.label === 'New') {
    return null;
  }
  return (
    <span
      className={`inline-flex rounded-sm px-1 py-px text-caption font-medium ${
        TONE_CLASSES[delta.tone]
      }`}
    >
      {delta.label}
    </span>
  );
}
