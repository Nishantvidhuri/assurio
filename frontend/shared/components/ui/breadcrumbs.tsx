'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover';

/**
 * A single breadcrumb item. Rendered as muted text by default,
 * or as darker body text when active (last item in the trail).
 */
export interface BreadcrumbItemProps {
  children: ReactNode;
  isActive?: boolean;
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

/** An option in a breadcrumb switcher menu. */
export interface BreadcrumbMenuItem {
  label: string;
  href: string;
  /** The current crumb — highlighted and non-navigating. */
  active?: boolean;
}

/**
 * A breadcrumb crumb that carries a sibling list — the label plus a dropdown
 * chevron. The chevron reads as the `›` separator at rest (pointing right),
 * rotates down on hover / when open (turning primary), and holds ~300ms before
 * rotating back so brushing past it doesn't snap. Only crumbs with a list get
 * this; plain crumbs use BreadcrumbItem + a static separator.
 */
export function BreadcrumbSwitcher({
  label,
  isActive = false,
  items,
  onNavigate,
}: {
  label: string;
  isActive?: boolean;
  items: BreadcrumbMenuItem[];
  onNavigate: (href: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group/switcher inline-flex items-center gap-1 whitespace-nowrap"
        >
          <span
            className={cn(
              '!text-caption font-medium leading-[20px] tracking-body-sm transition-colors',
              isActive ? 'text-text-body' : 'text-text-subheading',
              'group-hover/switcher:text-text-body',
            )}
          >
            {label}
          </span>
          <ChevronDown
            size={13}
            aria-hidden
            className={cn(
              'shrink-0 transition-[transform,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
              open
                ? 'rotate-0 text-primary delay-0'
                : '-rotate-90 text-neutral-500 delay-300 group-hover/switcher:rotate-0 group-hover/switcher:text-primary group-hover/switcher:delay-0',
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-72 w-56 overflow-y-auto rounded-lg border border-border-default bg-white p-1 shadow-lg"
      >
        {items.length === 0 ? (
          <div className="px-3 py-2 text-body-sm text-text-placeholder">
            No other items
          </div>
        ) : (
          items.map((it) => (
            <button
              key={it.href}
              type="button"
              onClick={() => {
                setOpen(false);
                onNavigate(it.href);
              }}
              className={cn(
                'block w-full truncate rounded-md px-3 py-2 text-left text-body-sm transition-colors',
                it.active
                  ? 'bg-neutral-100 font-medium text-text-heading'
                  : 'text-text-body hover:bg-neutral-100',
              )}
            >
              {it.label}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Static chevron separator between plain crumbs — no animation. */
function BreadcrumbSeparator() {
  return (
    <ChevronDown
      size={14}
      aria-hidden
      className="shrink-0 -rotate-90 text-neutral-500"
    />
  );
}

export interface BreadcrumbsProps {
  children: ReactNode;
  className?: string;
}

export function Breadcrumbs({ children, className }: BreadcrumbsProps) {
  const items = Array.isArray(children) ? children.flat().filter(Boolean) : [children];

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1.5', className)}>
      {items.map((child, index) => (
        <span key={index} className="flex items-center gap-1.5">
          {index > 0 && <BreadcrumbSeparator />}
          {child}
        </span>
      ))}
    </nav>
  );
}
