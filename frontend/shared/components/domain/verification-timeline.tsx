'use client';

import {
  Stepper,
  Tag,
  type StepperItem,
  type StepperStatus,
} from '@/shared/components/ui';

export interface VerificationTimelineStep {
  id: string;
  label: string;
}

const DEFAULT_STEPS: VerificationTimelineStep[] = [
  { id: 'requested', label: 'Verification Requested' },
  { id: 'documents', label: 'Documents Uploaded' },
  { id: 'vendor', label: 'Vendor Assigned' },
  { id: 'in-progress', label: 'Verification in progress' },
  { id: 'review', label: 'Under Review' },
  { id: 'completed', label: 'Verification Completed' },
];

interface VerificationTimelineProps {
  currentStepIndex: number;
  steps?: VerificationTimelineStep[];
  className?: string;
  /** Layout direction of the underlying Stepper. Defaults to vertical
   *  (legacy sidebar). The top-of-page timeline uses 'horizontal'. */
  orientation?: 'vertical' | 'horizontal';
  /** Horizontal-only alignment — see Stepper. 'start' left-aligns every
   *  label under its node; 'edges' pins first-left/last-right. */
  horizontalAlign?: 'center' | 'edges' | 'start';
  itemClassName?: string;
  revoked?: boolean;
  /**
   * Check names that have at least one client-approved additional charge.
   * When present, each name renders as a green "Extra fees covered <name>"
   * tag under the "Verification in progress" step.
   */
  extraFeesCoveredCheckNames?: string[];
}

const IN_PROGRESS_STEP_ID = 'in-progress';

function resolveStepStatus(
  stepIndex: number,
  currentStepIndex: number,
): StepperStatus {
  if (stepIndex < currentStepIndex) return 'completed';
  if (stepIndex === currentStepIndex) return 'ongoing';
  return 'not_started';
}

function joinNames(names: string[]) {
  const normalized = names.map((name) => name.toLowerCase());
  if (normalized.length === 0) return '';
  if (normalized.length === 1) return normalized[0];
  if (normalized.length === 2) return `${normalized[0]} & ${normalized[1]}`;
  const head = normalized.slice(0, -1).join(', ');
  const tail = normalized[normalized.length - 1];
  return `${head} & ${tail}`;
}

function renderExtraFeesSubtitle(names: string[]) {
  return (
    <span className="inline-flex pb-5">
      <Tag
        variant="Success"
        label={`Extra fees covered ${joinNames(names)}`}
        className="whitespace-nowrap"
      />
    </span>
  );
}

export function VerificationTimeline({
  currentStepIndex,
  steps = DEFAULT_STEPS,
  className,
  orientation = 'vertical',
  horizontalAlign = 'center',
  itemClassName,
  revoked = false,
  extraFeesCoveredCheckNames,
}: VerificationTimelineProps) {
  // Clamp the revoked pause index to an actual timeline step so a
  // post-completion index (6) still tags the last step.
  const revokedStepIndex = Math.min(currentStepIndex, steps.length - 1);
  const extraFeesNames = extraFeesCoveredCheckNames ?? [];
  const hasExtraFees = extraFeesNames.length > 0;

  const items: StepperItem[] = steps.map((step, index) => {
    const status: StepperStatus = revoked
      ? index < revokedStepIndex
        ? 'completed'
        : index === revokedStepIndex
          ? 'error'
          : 'not_started'
      : resolveStepStatus(index, currentStepIndex);

    const item: StepperItem = { id: step.id, title: step.label, status };

    const isRevokedStep = revoked && index === revokedStepIndex;
    const isInProgressStep = step.id === IN_PROGRESS_STEP_ID;

    if (isRevokedStep && isInProgressStep && hasExtraFees) {
      item.subtitle = (
        <div className="flex flex-col items-start gap-1 pb-2">
          <Tag variant="Failure" label="Verification revoked" />
          <Tag
            variant="Success"
            label={`Extra fees covered ${joinNames(extraFeesNames)}`}
            className="whitespace-nowrap"
          />
        </div>
      );
    } else if (isRevokedStep) {
      item.subtitle = (
        <span className="inline-flex">
          <Tag variant="Failure" label="Verification revoked" />
        </span>
      );
    } else if (isInProgressStep && hasExtraFees) {
      item.subtitle = renderExtraFeesSubtitle(extraFeesNames);
    }

    return item;
  });

  return (
    <Stepper
      items={items}
      orientation={orientation}
      horizontalAlign={horizontalAlign}
      connectorLength={24}
      className={className}
      itemClassName={itemClassName}
    />
  );
}
