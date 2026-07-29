'use client';

import { type ReactNode, useRef, useState } from 'react';
import { SvgIcon, Tag } from '@/shared/components/ui';
import type { CandidateCaseCheckVerificationWorkflowStatus } from '@/modules/candidate/commons/candidate-case-checks.types';
import { useAnimatedToggle } from '@/shared/hooks/use-animated-toggle';
import { cn } from '@/shared/lib/utils';
import chevronIcon from '@/public/assets/icons/chevron-down-medium/Chevron_Down_Medium=20px.svg'
import { formatDate } from '@/shared/utils/date-formatters';

export interface VerificationCheckAccordionItem {
  id: string;
  checkName: string;
  checkIcon: string;
  workflowStatus: CandidateCaseCheckVerificationWorkflowStatus;
  updatedAt?: string | null;
  // Upstream vendor for automated checks. `null` for manual checks
  // (address, education, reference). Rendered in the header only for
  // the internal context.
  vendor?: { kind: 'surepass' | 'konnect-nxt'; label: string } | null;
}

export type VerificationChecksAccordionContext = 'internal' | 'client';

interface VerificationChecksAccordionProps {
  checks: VerificationCheckAccordionItem[];
  renderContent?: (check: VerificationCheckAccordionItem) => ReactNode;
  renderHeaderAction?: (check: VerificationCheckAccordionItem) => ReactNode;
  context?: VerificationChecksAccordionContext;
  className?: string;
}

export function getStatusTag(
  status: CandidateCaseCheckVerificationWorkflowStatus,
  context: VerificationChecksAccordionContext,
): { variant: 'Default' | 'Primary' | 'Warning' | 'Success' | 'Failure' | 'Info'; label: string } {
  switch (status) {
    case 'COMPLETED':
      return { variant: 'Success', label: 'Completed' };
    case 'COMPLETED_WITH_DISCREPANCY':
      return { variant: 'Warning', label: 'Completed with discrepancy' };
    case 'NOT_CONDUCTED':
      return { variant: 'Failure', label: 'Not conducted' };
    case 'FAILED_TO_VERIFY':
      return { variant: 'Failure', label: 'Failed to verify' };
    case 'CLOSED_BY_CLIENT':
      return {
        variant: 'Failure',
        label: context === 'client' ? 'Closed' : 'Closed by client',
      };
    case 'VERIFIED_BY_CLIENT':
      return {
        variant: 'Success',
        label: context === 'client' ? 'Verified' : 'Verified by client',
      };
    case 'RAISE_INSUFFICIENCY':
      return { variant: 'Failure', label: 'Insufficiency Raised' };
    case 'IN_PROGRESS':
      return { variant: 'Info', label: 'In progress' };
    case 'AWAITING_INPUT':
    default:
      return { variant: 'Warning', label: 'Awaiting input' };
  }
}

function VerificationCheckAccordionRow({
  check,
  isExpanded,
  context,
  renderContent,
  renderHeaderAction,
  onToggle,
}: {
  check: VerificationCheckAccordionItem;
  isExpanded: boolean;
  context: VerificationChecksAccordionContext;
  renderContent?: (check: VerificationCheckAccordionItem) => ReactNode;
  renderHeaderAction?: (check: VerificationCheckAccordionItem) => ReactNode;
  onToggle: () => void;
}) {
  const tag = getStatusTag(check.workflowStatus, context);
  const updatedLabel = formatDate(check.updatedAt, true);
  const { shouldRender, isVisible } = useAnimatedToggle(isExpanded, 400);
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="rounded-md border border-border-default bg-white">
      <div className="flex w-full items-center justify-between gap-2 p-5">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={isExpanded}
        >
          <SvgIcon src={check.checkIcon} size={6} color='text-icon-info' alt={check.checkName} />
          <span className="text-subtitle-md font-semibold text-text-body">
            {check.checkName}
          </span>
          <Tag variant={tag.variant} label={tag.label} />
          {context === 'internal' && check.vendor ? (
            <Tag variant="Default" label={check.vendor.label} />
          ) : null}
           <span
            aria-label={isExpanded ? "Collapse" : "Expand"}
            className="inline-flex size-5 items-center justify-center text-text-body"
          >
            <SvgIcon
              src={chevronIcon}
              alt="Chevron"
              className={cn(
                " transition-transform duration-400",
                isExpanded && "rotate-180",
              )}
              size={5}
            />
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {updatedLabel && (
            <span className="text-body-sm font-medium text-text-subheading">
              Updated on <span className='text-text-body'>{updatedLabel}</span>
            </span>
          )}
          {renderHeaderAction ? (
            <span className="inline-flex items-center">
              {renderHeaderAction(check)}
            </span>
          ) : null}
        </div>
      </div>

      {renderContent && (shouldRender || isExpanded) ? (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-400 ease-in-out"
          style={{
            gridTemplateRows: isVisible ? '1fr' : '0fr',
            opacity: isVisible ? 1 : 0,
          }}
        >
          <div
            className={cn(
              'min-h-0',
              isExpanded && isVisible ? 'overflow-visible' : 'overflow-hidden',
            )}
          >
            <div ref={contentRef} className="border-t border-border-default border-t-0">
              {renderContent(check)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function VerificationChecksAccordion({
  checks,
  renderContent,
  renderHeaderAction,
  context = 'internal',
  className,
}: VerificationChecksAccordionProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {checks.map((check) => (
        <VerificationCheckAccordionRow
          key={check.id}
          check={check}
          isExpanded={expandedIds.has(check.id)}
          context={context}
          renderContent={renderContent}
          renderHeaderAction={renderHeaderAction}
          onToggle={() => toggleExpand(check.id)}
        />
      ))}
    </div>
  );
}
