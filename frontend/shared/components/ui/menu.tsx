'use client';

import { type ChangeEventHandler, type HTMLAttributes, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { MenuItem, type MenuItemProps } from './menu-item';

export interface MenuOption extends Omit<MenuItemProps, 'className'> {
  id: string;
}

export interface MenuProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  items: MenuOption[];
  className?: string;
  label?: string;
  showSearchBar?: boolean;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: ChangeEventHandler<HTMLInputElement>;
  maxHeight?: number;
  showScrollbar?: boolean;
  emptyState?: ReactNode;
}

/**
 * RDS Menu — Figma node 3165:1543
 */
export function Menu({
  items,
  className,
  label,
  showSearchBar = false,
  searchValue = '',
  searchPlaceholder = 'Search',
  onSearchChange,
  maxHeight,
  showScrollbar = false,
  emptyState,
  ...rest
}: MenuProps) {
  return (
    <div
      className={cn(
        'relative z-30 w-[180px] overflow-hidden rounded-md border border-neutral-300 bg-white py-1 shadow-[0px_3px_10px_0px_rgba(11,26,59,0.06)] animate-[menuSlideIn_400ms_ease-out]',
        className,
      )}
      {...rest}
    >
      {showSearchBar ? (
        <div className="px-2 py-1">
          <div className="flex h-9 items-center gap-1 rounded-md border border-border-default bg-white p-2 transition-colors focus-within:border-border-focused!">
            <Search className="size-4 text-icon-muted" />
            <input
              type="text"
              value={searchValue}
              placeholder={searchPlaceholder}
              onChange={onSearchChange}
              className="w-full border-none bg-transparent text-body-md font-normal leading-[20px] tracking-body-md text-text-body outline-none placeholder:text-text-disabled"
            />
          </div>
        </div>
      ) : null}

      {label ? (
        <div className="px-1 py-0.5">
          <div className="w-full px-2 pt-1.5">
            <p className="text-body-sm font-semibold leading-[20px] tracking-body-sm text-text-body">
              {label}
            </p>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          'w-full',
          maxHeight
            ? showScrollbar
              ? 'overflow-y-auto'
              : 'overflow-hidden'
            : undefined,
        )}
        style={maxHeight ? { maxHeight: `${maxHeight}px` } : undefined}
      >
        {items.length === 0 && emptyState ? (
          emptyState
        ) : (
          items.map((item) => <MenuItem key={item.id} {...item} />)
        )}
      </div>
    </div>
  );
}
