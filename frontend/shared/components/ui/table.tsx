/* eslint-disable @next/next/no-img-element */
'use client';

import { forwardRef, type HTMLAttributes, type ReactNode, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';
import { cva } from 'class-variance-authority';
import { Pencil, Share2, Trash2, MoreVertical, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Checkbox } from './checkbox';
import { Switch } from './switch';
import { Button } from './button';
import { SvgIcon } from './svg-icon';
import { HoverTooltipAnchor } from './hover-tooltip-anchor';
import arrowDownUpIcon from '@/public/assets/icons/move-vertical/Move_Vertical.svg'
import arrowUpIcon from '@/public/assets/icons/arrow-up-medium/Arrow_Up_Medium.svg'
import arrowDownIcon from '@/public/assets/icons/arrow-down-medium/Arrow_Down_Medium.svg'

/* ═══════════════════════════════════════════════════════════════════════════
 * RDS Table — Figma nodes 3093:1050 (Header Cell) & 3089:726 (Table Cell)
 *
 * Compound component API:
 *   <Table>
 *     <TableHeader>
 *       <TableRow>
 *         <TableHeaderCell type="checkbox" />
 *         <TableHeaderCell type="default" label="Name" sortable filterable roundedLeft />
 *         <TableHeaderCell type="number"  label="Score" sortable />
 *         <TableHeaderCell type="empty"   roundedRight />
 *       </TableRow>
 *     </TableHeader>
 *     <TableBody>
 *       <TableRow>
 *         <TableCell type="checkbox" checked={...} onCheckedChange={...} />
 *         <TableCell type="primary"  primaryText="John Doe" subtext="john@acme.com" />
 *         <TableCell type="number"   value={42} />
 *         <TableCell type="actions"  onEdit={...} onDelete={...} />
 *       </TableRow>
 *     </TableBody>
 *   </Table>
 *
 * ─── Token mapping ──────────────────────────────────────────────────────
 *   Header bg            → neutral-200 (#f9fbff)
 *   Header height        → h-[46px]
 *   Cell border          → border-b border-neutral-300
 *   Cell height          → h-[46px]
 *   Cell padding         → p-3 (12px)
 *   Row hover            → bg-surface-btn-secondary-hover (#f9fbff)
 *
 *   Header text          → text-body-md font-medium text-text-body
 *   Default cell text    → text-body-md font-normal text-text-body (left-aligned)
 *   Number cell text     → text-body-md font-normal text-text-body (RIGHT-ALIGNED)
 *   Primary text         → text-body-md font-medium text-text-link (#174ab5)
 *   Subtext              → text-body-sm font-medium text-text-subheading
 *   Link text            → text-body-md font-medium text-text-link
 *   No-data              → em-dash "—"
 *
 *   Status chip (Default/Warning/Success/Failure/Primary)
 *     Warning → bg-[#fff9ec] text-[#ffb522]   (surface/warning + text/warning)
 *     Success → bg-[#edfff4] text-icon-success
 *     Failure → bg-[#fff0f0] text-failure
 *     Primary → bg-primary-200 text-primary
 *     Default → bg-neutral-400 text-text-body
 *
 *   Progress bar track   → bg-neutral-400, h-[4px], w-[72px], rounded-[8px]
 *   Progress bar fill    → bg-icon-success (#2fab5d)
 *
 *   Action icons         → size-5 (20px), text-icon-default
 *   More icon            → size-5 (20px)
 * ═══════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────── */
/*  Status chip variants                                                   */
/* ─────────────────────────────────────────────────────────────────────── */

const statusChipVariants = cva(
  'inline-flex items-center justify-center rounded-full px-2 py-[1px]',
  {
    variants: {
      variant: {
        Default: 'bg-neutral-400 text-text-body',
        Success: 'bg-[#edfff4] text-icon-success',
        Warning: 'bg-[#fff9ec] text-[#ffb522]',
        Failure: 'bg-[#fff0f0] text-failure',
        Primary: 'bg-primary-200 text-primary',
      },
    },
    defaultVariants: { variant: 'Warning' },
  },
);

type StatusVariant = 'Default' | 'Success' | 'Warning' | 'Failure' | 'Primary';

/* ─────────────────────────────────────────────────────────────────────── */
/*  Table root                                                             */
/* ─────────────────────────────────────────────────────────────────────── */

export interface TableProps extends HTMLAttributes<HTMLDivElement> {
  /** Wrap the table in a bordered, rounded card shell */
  bordered?: boolean;
}

/**
 * RDS Table root wrapper.
 * Renders a scrollable `<div>` around a full-width `<table>`.
 */
const Table = forwardRef<HTMLDivElement, TableProps>(
  ({ className, bordered = false, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'w-full overflow-x-auto',
        bordered && 'rounded-md border border-border-default',
        className,
      )}
      {...props}
    >
      <table className="w-full border-collapse">{children}</table>
    </div>
  ),
);
Table.displayName = 'Table';

/* ─────────────────────────────────────────────────────────────────────── */
/*  Table Header                                                           */
/* ─────────────────────────────────────────────────────────────────────── */

const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn(className)} {...props} />
  ),
);
TableHeader.displayName = 'TableHeader';

/* ─────────────────────────────────────────────────────────────────────── */
/*  Table Body                                                             */
/* ─────────────────────────────────────────────────────────────────────── */

const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn(className)} {...props} />
  ),
);
TableBody.displayName = 'TableBody';

/* ─────────────────────────────────────────────────────────────────────── */
/*  Table Row                                                              */
/* ─────────────────────────────────────────────────────────────────────── */

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Enable the row hover highlight */
  hoverable?: boolean;
}

const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, hoverable = true, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        hoverable &&
          'hover:bg-surface-btn-secondary-hover/70 transition-colors',
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

/* ─────────────────────────────────────────────────────────────────────── */
/*  Table Header Cell                                                      */
/* ─────────────────────────────────────────────────────────────────────── */

export interface TableHeaderCellProps
  extends Omit<ThHTMLAttributes<HTMLTableCellElement>, 'type'> {
  /**
   * Cell variant — Figma types:
   *   default   → text label + optional sort/filter icons
   *   number    → same layout as default; data column values are right-aligned
   *   checkbox  → select-all checkbox
   *   empty     → blank cell (used for action/icon columns)
   */
  type?: 'default' | 'number' | 'checkbox' | 'empty';
  label?: string;
  /** Show the filter icon */
  filterable?: boolean;
  /** Enable sorting — shows a clickable sort icon */
  sortable?: boolean;
  /** Current sort direction for this column (null = unsorted) */
  sortOrder?: 'asc' | 'desc' | null;
  /** Called when the user clicks to toggle sort on this column */
  onSort?: () => void;
  /** Select-all checked state (only for type="checkbox") */
  checked?: boolean;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** Round the top-left corner (first column) */
  roundedLeft?: boolean;
  /** Round the top-right corner (last column) */
  roundedRight?: boolean;
   /** Required field indicator */
  required?: boolean;
}

const FilterIcon = () => (
  /* Lucide doesn't have an exact match — inline SVG from Figma "Interface/Filter" */
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="size-4 text-icon-muted" aria-hidden="true">
    <path
      d="M2 4h12M4 8h8M6 12h4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const SortNeutralIcon = () => (
    <SvgIcon src={arrowDownUpIcon} color='text-icon-muted' alt='Arrow Down Up' />
);

const SortAscIcon = () => (
  <SvgIcon src={arrowUpIcon} color='text-primary' alt='Arrow Down Up' />
);

const SortDescIcon = () => (
    <SvgIcon src={arrowDownIcon} color='text-primary' alt='Arrow Down Up' />
);

/**
 * RDS Table Header Cell — Figma node 3093:1050.
 *
 * Numbers note: type="number" marks a column whose data cells are
 * right-aligned. The header itself remains left-aligned per Figma.
 */
const TableHeaderCell = forwardRef<HTMLTableCellElement, TableHeaderCellProps>(
  (
    {
      className,
      type = 'default',
      label = 'Header',
      filterable = false,
      sortable = false,
      sortOrder: sortOrderProp = null,
      onSort,
      checked,
      indeterminate,
      onCheckedChange,
      disabled = false,
      roundedLeft = false,
      roundedRight = false,
      required = false,
      ...props
    },
    ref,
  ) => {
    const isCheckbox = type === 'checkbox';
    const isEmpty = type === 'empty';
    const hasIcons = (type === 'default' || type === 'number') && (filterable || sortable);

    const SortIconComponent =
      sortOrderProp === 'asc'
        ? SortAscIcon
        : sortOrderProp === 'desc'
          ? SortDescIcon
          : SortNeutralIcon;

    return (
      <th
        ref={ref}
        className={cn(
          'bg-neutral-200 h-[46px] p-3',
          !isEmpty && !isCheckbox && 'text-left',
          roundedLeft && 'rounded-tl-lg',
          roundedRight && 'rounded-tr-lg',
          isEmpty
            ? 'w-[56px]'
            : isCheckbox
              ? 'w-[46px] align-middle text-center leading-[0]'
              : '',
          sortable && 'cursor-pointer select-none',
          className,
        )}
        onClick={sortable && onSort ? onSort : undefined}
        {...props}
      >
        {isCheckbox && (
          <Checkbox
            size="Small"
            disableHoverEffect
            checked={checked}
            indeterminate={indeterminate}
            disabled={disabled}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
          />
        )}

        {(type === "default" || type === "number") && (
          <div className="flex items-center justify-start gap-2">
            <span className="text-body-md font-medium leading-[20px] tracking-body-md text-text-body whitespace-nowrap">
              {label}
              {required && (
                <span className="text-body-sm font-medium leading-[20px] tracking-body-sm text-text-error">
                  *
                </span>
              )}
            </span>
            {hasIcons && (
              <span className="flex items-center gap-1">
                {filterable && <FilterIcon />}
                {sortable && (
                  <span
                    className="inline-flex animate-[stepCheckPop_300ms_ease-out]"
                    key={sortOrderProp ?? "neutral"}
                  >
                    <SortIconComponent />
                  </span>
                )}
              </span>
            )}
          </div>
        )}

        {/* Empty cell renders nothing */}
      </th>
    );
  },
);
TableHeaderCell.displayName = 'TableHeaderCell';

/* ─────────────────────────────────────────────────────────────────────── */
/*  Table Cell                                                             */
/* ─────────────────────────────────────────────────────────────────────── */

export interface TableCellProps extends Omit<TdHTMLAttributes<HTMLTableCellElement>, 'type'> {
  /**
   * Cell content variant.
   *
   * default      → plain text, left-aligned
   * number       → plain text, RIGHT-ALIGNED (numbers always right-aligned per RDS)
   * primary      → bold blue link text + optional subtext + optional avatar
   * status       → colored pill/chip badge
   * actions      → icon action buttons (edit / share / delete)
   * moreIcon     → single 3-dot vertical menu icon
   * link         → inline blue text link
   * dropdown     → text value + chevron (opens a popover externally)
   * checkbox     → row selection checkbox
   * progressBar  → mini horizontal progress bar + percentage
   * noData       → em-dash "—"
   * buttons      → primary action button
   * switch       → toggle switch
   * empty        → blank cell
   */
  type?:
    | 'default'
    | 'number'
    | 'primary'
    | 'status'
    | 'actions'
    | 'moreIcon'
    | 'link'
    | 'dropdown'
    | 'checkbox'
    | 'progressBar'
    | 'noData'
    | 'buttons'
    | 'switch'
    | 'empty';

  /* ── default / number ─── */
  /** Text or ReactNode for default/number/link/dropdown cells */
  value?: ReactNode;

  /* ── primary ─── */
  primaryText?: string;
  subtext?: string;
  showSubtext?: boolean;
  /** URL for the primary text link */
  href?: string;
  onPrimaryClick?: () => void;
  avatarUrl?: string;
  showAvatar?: boolean;

  /* ── status ─── */
  statusLabel?: string;
  statusVariant?: StatusVariant;

  /* ── actions ─── */
  onEdit?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  /** Replace the default 3-icon set with custom action nodes */
  customActions?: React.ReactNode;

  /* ── moreIcon ─── */
  onMoreClick?: () => void;

  /* ── link ─── */
  label?: string;
  onLinkClick?: () => void;

  /* ── dropdown ─── */
  dropdownLabel?: string;
  onDropdownClick?: () => void;

  /* ── checkbox ─── */
  checked?: boolean;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  tooltipText?: string;

  /* ── progressBar ─── */
  /** 0–100 */
  progress?: number;

  /* ── buttons ─── */
  buttonLabel?: string;
  onButtonClick?: () => void;

  /* ── switch ─── */
  switchChecked?: boolean;
  onSwitchChange?: (checked: boolean) => void;
}

/**
 * RDS Table Cell — Figma node 3089:726.
 *
 * IMPORTANT: Number cells are always right-aligned (per RDS nuance).
 * Use type="number" for any column containing numeric data.
 */
const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  (
    {
      className,
      type = 'default',
      value,
      primaryText = 'Primary Text',
      subtext = 'Subtext',
      showSubtext = true,
      href,
      onPrimaryClick,
      avatarUrl,
      showAvatar = false,
      statusLabel = 'Value',
      statusVariant = 'Warning',
      onEdit,
      onShare,
      onDelete,
      customActions,
      onMoreClick,
      label = 'Link',
      onLinkClick,
      dropdownLabel = 'Value',
      onDropdownClick,
      checked,
      indeterminate,
      onCheckedChange,
      disabled = false,
      tooltipText,
      progress = 50,
      buttonLabel = 'Button',
      onButtonClick,
      switchChecked,
      onSwitchChange,
      ...props
    },
    ref,
  ) => {
    const baseCell = cn(
      'border-b border-border-default p-3 h-[46px]',
      className,
    );
    const isPrimitiveValue =
      typeof value === 'string' || typeof value === 'number';

    /* ── empty ─── */
    if (type === 'empty') {
      return <td ref={ref} className={cn('w-[56px]', baseCell)} {...props} />;
    }

    /* ── checkbox ─── */
    if (type === 'checkbox') {
      return (
        <td ref={ref} className={cn(baseCell, 'w-[46px] align-middle text-center leading-[0]')} {...props}>
          {tooltipText ? (
            <HoverTooltipAnchor
              text={tooltipText}
              position="bottom-center"
              tooltipClassName="max-w-[240px]"
            >
              <Checkbox
                size="Small"
                disableHoverEffect
                checked={checked}
                indeterminate={indeterminate}
                disabled={disabled}
                onChange={(e) => onCheckedChange?.(e.target.checked)}
              />
            </HoverTooltipAnchor>
          ) : (
            <Checkbox
              size="Small"
              disableHoverEffect
              checked={checked}
              indeterminate={indeterminate}
              disabled={disabled}
              onChange={(e) => onCheckedChange?.(e.target.checked)}
            />
          )}
        </td>
      );
    }

    /* ── default (plain text, left-aligned) ─── */
    if (type === 'default') {
      return (
        <td ref={ref} className={baseCell} {...props}>
          {isPrimitiveValue ? (
            <span className="text-body-md font-normal leading-[22px] tracking-body-md text-text-body">
              {value}
            </span>
          ) : (
            value
          )}
        </td>
      );
    }

    /* ── number (plain text, RIGHT-aligned) ─── */
    if (type === 'number') {
      return (
        <td ref={ref} className={cn(baseCell, 'text-right')} {...props}>
          {isPrimitiveValue ? (
            <span className="text-body-md font-normal leading-[22px] tracking-body-md text-text-body">
              {value}
            </span>
          ) : (
            value
          )}
        </td>
      );
    }

    /* ── primary (blue link + optional subtext + optional avatar) ───
     * NOTE: the flex layout lives on an inner div, NOT the <td> itself.
     * `display:flex` on a <td> pulls it out of the table grid — its
     * bottom border then only spans the content width (stray short
     * divider under the text) and the column alignment drifts. */
    if (type === 'primary') {
      const Tag = href ? 'a' : 'button';
      return (
        <td ref={ref} className={baseCell} {...props}>
          <div className="flex items-center gap-2">
            {showAvatar && avatarUrl && (
              <img
                src={avatarUrl}
                alt=""
                className="shrink-0 size-8 rounded-full object-cover"
              />
            )}
            <div className="flex flex-col items-start justify-center whitespace-nowrap font-medium">
              <Tag
                {...(href ? { href } : { type: 'button' as const })}
                onClick={onPrimaryClick}
                className="text-body-md leading-[22px] tracking-body-md text-text-link hover:underline"
              >
                {primaryText}
              </Tag>
              {showSubtext && (
                <span className="text-body-sm leading-[20px] tracking-body-sm text-text-subheading">
                  {subtext}
                </span>
              )}
            </div>
          </div>
        </td>
      );
    }

    /* ── status chip ─── */
    if (type === 'status') {
      return (
        <td ref={ref} className={baseCell} {...props}>
          <span className={cn(statusChipVariants({ variant: statusVariant }))}>
            <span className="text-body-sm font-medium leading-[20px] tracking-body-sm whitespace-nowrap">
              {statusLabel}
            </span>
          </span>
        </td>
      );
    }

    /* ── actions (edit / share / delete icons) ─── */
    if (type === 'actions') {
      return (
        <td ref={ref} className={baseCell} {...props}>
          <div className="flex items-center gap-2">
            {customActions ?? (
              <>
                {onEdit && (
                  <button
                    type="button"
                    aria-label="Edit"
                    onClick={onEdit}
                    className="size-5 flex items-center justify-center text-icon-default hover:text-primary transition-colors"
                  >
                    <Pencil className="size-5" />
                  </button>
                )}
                {onShare && (
                  <button
                    type="button"
                    aria-label="Share"
                    onClick={onShare}
                    className="size-5 flex items-center justify-center text-icon-default hover:text-primary transition-colors"
                  >
                    <Share2 className="size-5" />
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    aria-label="Delete"
                    onClick={onDelete}
                    className="size-5 flex items-center justify-center text-icon-default hover:text-failure transition-colors"
                  >
                    <Trash2 className="size-5" />
                  </button>
                )}
              </>
            )}
          </div>
        </td>
      );
    }

    /* ── moreIcon (3-dot vertical) ─── */
    if (type === 'moreIcon') {
      return (
        <td ref={ref} className={baseCell} {...props}>
          <button
            type="button"
            aria-label="More options"
            onClick={onMoreClick}
            className="size-5 flex items-center justify-center text-icon-default hover:text-text-body transition-colors"
          >
            <MoreVertical className="size-5" />
          </button>
        </td>
      );
    }

    /* ── link (blue text link) ─── */
    if (type === 'link') {
      return (
        <td ref={ref} className={baseCell} {...props}>
          <button
            type="button"
            onClick={onLinkClick}
            className="text-body-md font-medium leading-[20px] tracking-body-md text-text-link hover:underline whitespace-nowrap"
          >
            {label}
          </button>
        </td>
      );
    }

    /* ── dropdown (value + chevron, trigger handled externally) ─── */
    if (type === 'dropdown') {
      return (
        <td ref={ref} className={baseCell} {...props}>
          <button
            type="button"
            onClick={onDropdownClick}
            className="flex items-center gap-1 text-body-md font-normal leading-[22px] tracking-body-md text-text-body whitespace-nowrap"
          >
            {dropdownLabel}
            <ChevronRight className="size-4 rotate-90 text-icon-muted" aria-hidden="true" />
          </button>
        </td>
      );
    }

    /* ── progressBar ─── */
    if (type === 'progressBar') {
      const clampedProgress = Math.min(100, Math.max(0, progress));
      return (
        <td ref={ref} className={baseCell} {...props}>
          {/* Flex on an inner div — display:flex on the <td> itself breaks
           * the table grid (partial-width borders, drifted columns). */}
          <div className="flex items-center gap-2">
            <div className="bg-neutral-400 h-[4px] w-[72px] rounded-[8px] overflow-hidden shrink-0">
              <div
                className="bg-icon-success h-full rounded-[8px] transition-all"
                style={{ width: `${clampedProgress}%` }}
              />
            </div>
            <span className="flex items-center text-body-md font-normal leading-[22px] tracking-body-md text-text-body whitespace-nowrap">
              {clampedProgress}
              <span>%</span>
            </span>
          </div>
        </td>
      );
    }

    /* ── noData (em-dash) ─── */
    if (type === 'noData') {
      return (
        <td ref={ref} className={baseCell} {...props}>
          <span className="text-body-md font-normal leading-[22px] tracking-body-md text-text-body">
            &mdash;
          </span>
        </td>
      );
    }

    /* ── buttons (primary action button) ─── */
    if (type === 'buttons') {
      return (
        <td ref={ref} className={baseCell} {...props}>
          <Button variant="primary" onClick={onButtonClick}>
            {buttonLabel}
          </Button>
        </td>
      );
    }

    /* ── switch ─── */
    if (type === 'switch') {
      return (
        <td ref={ref} className={baseCell} {...props}>
          <Switch
            checked={switchChecked}
            onChange={(e) => onSwitchChange?.(e.target.checked)}
          />
        </td>
      );
    }

    /* Fallback */
    return <td ref={ref} className={baseCell} {...props} />;
  },
);
TableCell.displayName = 'TableCell';

/* ─────────────────────────────────────────────────────────────────────── */
/*  Exports                                                                */
/* ─────────────────────────────────────────────────────────────────────── */

export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  statusChipVariants,
  type StatusVariant,
};
