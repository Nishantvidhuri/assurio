import { type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import chevronRightIcon from '@/public/assets/icons/chevron-right-medium/Chevron_Right_Medium=16px.svg'
import { SvgIcon } from './svg-icon';

/**
 * A single breadcrumb item. Rendered as muted text by default,
 * or as darker body text when active (last item in the trail).
 *
 * Figma node: 3126:331 (BreadcrumbsItem sub-component)
 * Font: Manrope Medium, 12px / 20px, tracking 0.25px
 */
export interface BreadcrumbItemProps {
  /** Display text for this crumb */
  children: ReactNode;
  /** Marks this item as the current / active page */
  isActive?: boolean;
  /** Optional click handler (typically for non-active crumbs) */
  onClick?: () => void;
  className?: string;
}

export function BreadcrumbItem({
  children,
  isActive = false,
  onClick,
  className,
}: BreadcrumbItemProps) {
  const Tag = onClick ? 'button' : 'span';

  return (
    <Tag
      className={cn(
        '!text-caption font-medium leading-[20px] tracking-body-sm whitespace-nowrap',
        isActive ? 'text-text-body' : 'text-text-subheading',
        onClick && 'cursor-pointer hover:text-text-body transition-colors',
        className,
      )}
      onClick={onClick}
      type={Tag === 'button' ? 'button' : undefined}
    >
      {children}
    </Tag>
  );
}

/**
 * Chevron separator between breadcrumb items.
 * Figma: Arrow / Chevron_Right_MD — 16x16, icon-muted color.
 */
function BreadcrumbSeparator() {
  return (
    <SvgIcon src={chevronRightIcon} color='text-neutral-700' alt="Chevron Right" />
  );
}

/**
 * RDS Breadcrumbs container — Figma node 3126:331.
 *
 * Renders a horizontal list of BreadcrumbItem children separated by
 * chevron-right icons. Supports overflow with "..." truncation.
 *
 * Figma variants: One, Two, Three, Four, Overflow Middle, Overflow Begining
 * Spacing: gap 4px (spacing/s), padding 0
 *
 * @example
 * ```tsx
 * <Breadcrumbs>
 *   <BreadcrumbItem onClick={() => router.push('/')}>Home</BreadcrumbItem>
 *   <BreadcrumbItem onClick={() => router.push('/projects')}>Projects</BreadcrumbItem>
 *   <BreadcrumbItem isActive>Task 2</BreadcrumbItem>
 * </Breadcrumbs>
 *
 * // With overflow
 * <Breadcrumbs>
 *   <BreadcrumbItem onClick={goHome}>Home</BreadcrumbItem>
 *   <BreadcrumbItem>...</BreadcrumbItem>
 *   <BreadcrumbItem isActive>Task 1</BreadcrumbItem>
 * </Breadcrumbs>
 * ```
 */
export interface BreadcrumbsProps {
  children: ReactNode;
  className?: string;
}

export function Breadcrumbs({ children, className }: BreadcrumbsProps) {
  const items = Array.isArray(children) ? children.flat().filter(Boolean) : [children];

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1', className)}>
      {items.map((child, index) => (
        <span key={index} className="flex items-center gap-1">
          {index > 0 && <BreadcrumbSeparator />}
          {child}
        </span>
      ))}
    </nav>
  );
}
