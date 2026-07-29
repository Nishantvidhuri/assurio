'use client';

import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Tag } from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
// The chosen hook is stable per environment, so this isn't a conditional
// hook call.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;
import {
  getStatusTag,
  type VerificationCheckAccordionItem,
  type VerificationChecksAccordionContext,
} from './verification-checks-accordion';

interface VerificationChecksTabsProps {
  checks: VerificationCheckAccordionItem[];
  /** Content for the currently-selected check. */
  renderContent?: (check: VerificationCheckAccordionItem) => ReactNode;
  /** Optional per-check action (e.g. client close / mark-verified menu),
   *  rendered to the right of the selected check's content header. */
  renderHeaderAction?: (check: VerificationCheckAccordionItem) => ReactNode;
  context?: VerificationChecksAccordionContext;
  className?: string;
}

export function VerificationChecksTabs({
  checks,
  renderContent,
  renderHeaderAction,
  context = 'internal',
  className,
}: VerificationChecksTabsProps) {
  const [activeId, setActiveId] = useState<string | null>(
    checks[0]?.id ?? null,
  );

  // If the active check disappears (data refresh), fall back to the first.
  // Adjust during render — cheaper than an effect and avoids a flash.
  const activeStillExists = checks.some((check) => check.id === activeId);
  if (!activeStillExists && checks.length > 0) {
    setActiveId(checks[0].id);
  }

  const activeCheck =
    checks.find((check) => check.id === activeId) ?? checks[0] ?? null;

  // Sliding underline — measure the active tab button and animate the
  // indicator's left/width via CSS transition.
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({
    left: 0,
    width: 0,
  });

  const syncIndicator = () => {
    const list = listRef.current;
    const activeTab = activeCheck ? tabRefs.current[activeCheck.id] : null;
    if (!list || !activeTab) return;
    const listRect = list.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();
    setIndicator({
      left: tabRect.left - listRect.left,
      width: tabRect.width,
    });
  };

  // useLayoutEffect so the indicator is positioned before paint (no flash
  // from 0-width on first render / when the active tab changes).
  useIsomorphicLayoutEffect(() => {
    syncIndicator();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCheck?.id, checks.length]);

  useEffect(() => {
    const handleResize = () => syncIndicator();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCheck?.id]);

  if (checks.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {/* Tab strip */}
      <div className="relative">
        <div ref={listRef} className="flex flex-wrap items-start gap-y-2">
          {checks.map((check, index) => {
            const tag = getStatusTag(check.workflowStatus, context);
            return (
              <button
                key={check.id}
                ref={(node) => {
                  tabRefs.current[check.id] = node;
                }}
                type="button"
                onClick={() => setActiveId(check.id)}
                className={cn(
                  // 12px top/bottom, 40px right, 20px left — but the first
                  // tab has no left padding so it aligns flush with the
                  // section's left edge (the timeline / heading).
                  'flex flex-col items-start gap-1.5 py-3 pr-10 text-left',
                  index === 0 ? 'pl-0' : 'pl-5',
                )}
              >
                <span
                  className='text-body-lg font-semibold transition-colors'>
                  {check.checkName}
                </span>
                <Tag variant={tag.variant} label={tag.label} />
              </button>
            );
          })}
        </div>

        {/* Full-width base divider */}
        <div className="h-px w-full bg-border-default" />

        {/* Sliding colored indicator sitting on top of the divider. */}
        <div
          className="absolute bottom-0 h-0.5 rounded-full bg-primary transition-[left,width] duration-300 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
        />
      </div>

      {/* Selected check content */}
      {activeCheck ? (
        <div className="flex flex-col gap-4">
          {renderHeaderAction ? (
            <div className="flex justify-start">
              {renderHeaderAction(activeCheck)}
            </div>
          ) : null}
          {renderContent ? renderContent(activeCheck) : null}
        </div>
      ) : null}
    </div>
  );
}
