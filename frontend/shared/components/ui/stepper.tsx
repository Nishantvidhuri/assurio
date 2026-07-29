'use client';

import { useState, type ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

/**
 * RDS Stepper — Figma nodes:
 * - Step Indicator: 3686:2688
 * - Steps: 3689:122
 * - Text: 3689:138
 * - Component: 3694:219
 */

export type StepperOrientation = 'horizontal' | 'vertical';
export type StepperStatus =
  | 'not_started'
  | 'ongoing'
  | 'completed'
  | 'error'
  | 'warning';
export type StepperConnectorTone = 'default' | 'completed' | 'error' | 'warning';
export type StepperTextState = 'active' | 'default' | 'placeholder';

export interface StepperItem {
  id: string;
  title?: string;
  subtitle?: ReactNode;
  status?: StepperStatus;
}

export interface StepperProps {
  items: StepperItem[];
  orientation?: StepperOrientation;
  className?: string;
  itemClassName?: string;
  connectorLength?: number;
  onItemClick?: (itemId: string) => void;
  /**
   * Horizontal-only.
   * - 'center' (default): node + label centered in each cell.
   * - 'edges': first node/label pinned left, last pinned right, middle
   *   centered.
   * - 'start': every node sits at the left of its cell with the connector
   *   trailing to the right, and every label is left-aligned directly
   *   under its node.
   */
  horizontalAlign?: 'center' | 'edges' | 'start';
  itemTrailing?: (item: StepperItem) => ReactNode;
}

export interface StepConnectorProps {
  orientation?: StepperOrientation;
  tone?: StepperConnectorTone;
  className?: string;
  length?: number;
}

export interface StepNodeProps {
  status?: StepperStatus;
  className?: string;
}

export interface StepTextProps {
  title?: string;
  subtitle?: ReactNode;
  state?: StepperTextState;
  className?: string;
}

const connectorToneVariants = cva('', {
  variants: {
    tone: {
      default: 'bg-neutral-700',
      completed: 'bg-primary',
      error: 'bg-failure',
      warning: 'bg-warning',
    },
  },
  defaultVariants: {
    tone: 'default',
  },
});

const stepNodeVariants = cva(
  'relative inline-flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px] border-solid transition-all duration-500 ease-in-out',
  {
    variants: {
      status: {
        not_started: 'border-neutral-700 bg-white',
        ongoing: 'border-primary bg-white',
        completed: 'border-primary bg-white',
        error: 'border-failure bg-white',
        warning: 'border-warning bg-white',
      },
    },
    defaultVariants: {
      status: 'not_started',
    },
  },
);

const stepTextVariants = cva(
  'flex flex-col items-start justify-start gap-0.5 py-0.5 text-body-md font-medium leading-[20px] tracking-body-md',
  {
    variants: {
      state: {
        active: 'text-text-body',
        default: 'text-text-disabled',
        placeholder: 'text-text-subheading',
      },
    },
    defaultVariants: {
      state: 'active',
    },
  },
);

function CheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="size-5 text-white"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5.4 10.1L8.55 13.15L14.6 7.1"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="size-5 text-white"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6 6L14 14M14 6L6 14"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StepConnector({
  orientation = 'vertical',
  tone = 'default',
  className,
  length,
}: StepConnectorProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'block shrink-0 transition-[background-color] duration-500 ease-in-out',
        connectorToneVariants({ tone }),
        orientation === 'horizontal' ? 'h-px' : 'w-px',
        className,
      )}
      style={
        length === undefined
          ? undefined
          : orientation === 'horizontal'
            ? { width: `${length}px` }
            : { height: `${length}px` }
      }
    />
  );
}

export function StepNode({ status = 'not_started', className }: StepNodeProps) {
  const fillColorMap: Record<string, string> = {
    completed: 'bg-primary',
    error: 'bg-failure',
    warning: 'bg-warning',
  };

  const [prevStatus, setPrevStatus] = useState(status);
  const [pop, setPop] = useState(false);
  if (prevStatus !== status) {
    setPrevStatus(status);
    setPop(true);
  }
  const popClass = pop ? 'animate-[stepCheckPop_400ms_ease-out]' : '';
  const stopPop = () => setPop(false);

  return (
    <span className={cn(stepNodeVariants({ status }), className)}>
      {status === 'ongoing' ? (
        <span
          className={cn('size-3 rounded-full bg-primary', popClass)}
          onAnimationEnd={stopPop}
        />
      ) : null}
      {status === 'completed' || status === 'warning' ? (
        <span
          className={cn(
            'inline-flex size-4.75 items-center justify-center rounded-full',
            fillColorMap[status],
            popClass,
          )}
          onAnimationEnd={stopPop}
        >
          <CheckIcon />
        </span>
      ) : null}
      {status === 'error' ? (
        <span
          className={cn(
            'inline-flex size-4.75 items-center justify-center rounded-full',
            fillColorMap[status],
            popClass,
          )}
          onAnimationEnd={stopPop}
        >
          <CrossIcon />
        </span>
      ) : null}
    </span>
  );
}

export function StepText({
  title = 'Candidate Details added',
  subtitle,
  state = 'active',
  className,
}: StepTextProps) {
  const effectiveTitle = state === 'placeholder' ? '_' : title;

  return (
    <div className={cn(stepTextVariants({ state }), className)}>
      <p className="w-full text-body-md font-medium leading-[20px] tracking-body-md">
        {effectiveTitle}
      </p>
      {subtitle ? (
        typeof subtitle === 'string' ? (
          <p className="w-full text-body-sm font-medium leading-[20px] tracking-body-sm text-text-subheading">
            {subtitle}
          </p>
        ) : (
          <div className="w-full">{subtitle}</div>
        )
      ) : null}
    </div>
  );
}

function mapConnectorTone(status: StepperStatus): StepperConnectorTone {
  if (status === 'completed') return 'completed';
  if (status === 'error') return 'error';
  if (status === 'warning') return 'warning';
  return 'default';
}

function mapTextState(status: StepperStatus): StepperTextState {
  if (status === 'not_started') return 'default';
  return 'active';
}

export function Stepper({
  items,
  orientation = 'vertical',
  className,
  itemClassName,
  connectorLength = 24,
  onItemClick,
  horizontalAlign = 'center',
  itemTrailing,
}: StepperProps) {
  if (orientation === 'horizontal') {
    const edges = horizontalAlign === 'edges';
    const start = horizontalAlign === 'start';
    return (
      <ol className={cn('m-0 flex w-full list-none items-start p-0', className)}>
        {items.map((item, index) => {
          const status = item.status ?? 'not_started';
          const previousStatus =
            index > 0 ? items[index - 1]?.status ?? 'not_started' : undefined;
          const isLast = index === items.length - 1;
          const isFirst = index === 0;
          const textState = mapTextState(status);

          const isClickable = Boolean(onItemClick);

          // In 'edges' mode the first item's leading spacer and the last
          // item's trailing spacer collapse to zero, pinning those nodes to
          // the row's edges; their labels align to the same edge.
          // In 'start' mode every node hugs the left of its cell (no
          // leading connector) and the label is left-aligned beneath it.
          const pinLeft = start || (edges && isFirst);
          const pinRight = edges && isLast;
          const textAlignClass = start
            ? 'items-start text-left'
            : pinLeft
              ? 'items-start text-left'
              : pinRight
                ? 'items-end text-right'
                : 'items-center text-center';

          // 'start': drop the leading connector entirely so the node sits at
          // the very left; the trailing connector spans the whole gap to the
          // next node.
          const renderLeadingConnector = !start && index > 0;

          return (
            <li
              key={item.id}
              className={cn(
                'relative flex flex-1 flex-col items-center gap-3',
                itemClassName,
              )}
            >
              <button
                type="button"
                className={cn(
                  'flex w-full flex-col items-center gap-3 text-left',
                  isClickable ? 'cursor-pointer' : 'cursor-default',
                )}
                onClick={() => onItemClick?.(item.id)}
                disabled={!isClickable}
              >
              <div className="flex w-full items-center">
                {renderLeadingConnector ? (
                  <StepConnector
                    orientation="horizontal"
                    tone={mapConnectorTone(previousStatus ?? 'not_started')}
                    className="flex-1"
                  />
                ) : (
                  <span
                    aria-hidden
                    data-stepper-spacer
                    className={pinLeft ? 'w-0' : 'flex-1'}
                  />
                )}

                <div className="relative z-10 inline-flex shrink-0 items-center justify-center">
                  <StepNode status={status} />
                </div>

                {!isLast ? (
                  <StepConnector
                    orientation="horizontal"
                    tone={mapConnectorTone(status)}
                    className="flex-1"
                  />
                ) : (
                  <span
                    aria-hidden
                    data-stepper-spacer
                    className={pinRight || start ? 'w-0' : 'flex-1'}
                  />
                )}
              </div>

              <StepText
                title={item.title}
                subtitle={item.subtitle}
                state={textState}
                className={cn(
                  start ? 'w-full pr-3' : 'w-[182px]',
                  textAlignClass,
                )}
              />
              </button>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol
      className={cn(
        'm-0 list-none p-0',
        'flex flex-col gap-0',
        className,
      )}
    >
      {items.map((item, index) => {
        const status = item.status ?? 'not_started';
        const isLast = index === items.length - 1;
        const textState = mapTextState(status);
        const isClickable = Boolean(onItemClick);

        return (
          <li
            key={item.id}
            className={cn(
              'flex items-stretch gap-3',
              itemTrailing && 'w-full',
              itemClassName,
            )}
          >
            <button
              type="button"
              className={cn(
                'flex items-stretch gap-3 text-left',
                itemTrailing && 'w-full',
                isClickable ? 'cursor-pointer' : 'cursor-default',
              )}
              onClick={() => onItemClick?.(item.id)}
              disabled={!isClickable}
            >
              <div
                className={cn(
                  'flex w-6 flex-col items-center',
                )}
              >
                <StepNode status={status} />
                {!isLast ? (
                  <span
                    aria-hidden
                    className={cn(
                      'block w-px flex-1',
                      connectorToneVariants({
                        tone: mapConnectorTone(status),
                      }),
                    )}
                    style={{ minHeight: `${connectorLength}px` }}
                  />
                ) : null}
              </div>

              <StepText
                title={item.title}
                subtitle={item.subtitle}
                state={textState}
                className="w-[162px]"
              />

              {itemTrailing ? (
                <span className="ml-auto flex shrink-0 items-start pt-0.5">
                  {itemTrailing(item)}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
