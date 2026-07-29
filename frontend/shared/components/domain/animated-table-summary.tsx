'use client';

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface AnimatedTableSummaryProps {
  expanded: boolean;
  collapsedContent: ReactNode;
  expandedContent: ReactNode;
}

export function AnimatedTableSummary({
  expanded,
  collapsedContent,
  expandedContent,
}: AnimatedTableSummaryProps) {
  const collapsedMeasureRef = useRef<HTMLDivElement>(null);
  const expandedMeasureRef = useRef<HTMLDivElement>(null);
  const [collapsedHeight, setCollapsedHeight] = useState(0);
  const [expandedHeight, setExpandedHeight] = useState(0);

  useLayoutEffect(() => {
    const updateHeights = () => {
      setCollapsedHeight(collapsedMeasureRef.current?.offsetHeight ?? 0);
      setExpandedHeight(expandedMeasureRef.current?.offsetHeight ?? 0);
    };

    updateHeights();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      updateHeights();
    });

    if (collapsedMeasureRef.current) {
      observer.observe(collapsedMeasureRef.current);
    }

    if (expandedMeasureRef.current) {
      observer.observe(expandedMeasureRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [collapsedContent, expandedContent]);

  const targetHeight = expanded ? expandedHeight : collapsedHeight;
  const heightStyle =
    targetHeight > 0 ? { height: `${targetHeight}px` } : undefined;

  return (
    <div
      className="relative w-full overflow-hidden transition-[height] duration-200 ease-linear motion-reduce:transition-none"
      style={heightStyle}
    >
      <div
        className={
          expanded
            ? 'pointer-events-none absolute inset-0 opacity-0'
            : 'relative opacity-100'
        }
        aria-hidden={expanded}
      >
        {collapsedContent}
      </div>

      <div
        className={
          expanded
            ? 'relative opacity-100'
            : 'pointer-events-none absolute inset-0 opacity-0'
        }
        aria-hidden={!expanded}
      >
        {expandedContent}
      </div>

      <div
        aria-hidden
        className="pointer-events-none invisible absolute inset-x-0 top-0 -z-10"
      >
        <div ref={collapsedMeasureRef}>{collapsedContent}</div>
        <div ref={expandedMeasureRef}>{expandedContent}</div>
      </div>
    </div>
  );
}
