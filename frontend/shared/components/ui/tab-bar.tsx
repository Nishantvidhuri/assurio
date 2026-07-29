'use client';

import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/shared/lib/utils';
import { useSlidingIndicator } from '@/shared/hooks/use-sliding-indicator';

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Context                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

interface TabBarContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
  registerTab: (value: string, el: HTMLElement | null) => void;
}

const TabBarContext = createContext<TabBarContextValue | null>(null);

function useTabBarContext() {
  const ctx = useContext(TabBarContext);
  if (!ctx) throw new Error('TabBar compound components must be used within <TabBar>');
  return ctx;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  TabBar Root                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

export interface TabBarProps extends HTMLAttributes<HTMLDivElement> {
  /** The value of the initially active tab */
  defaultValue: string;
  /** Controlled value */
  value?: string;
  /** Called when the active tab changes */
  onValueChange?: (value: string) => void;
}

/**
 * RDS TabBar — Figma node 3266:1665.
 *
 * A pill-style segmented tab bar. The container has a neutral-400 background
 * with 1px neutral-500 border and 4px (spacing/s) padding. Active tab gets
 * a white background with subtle shadow.
 *
 * Token mapping:
 *   Container → bg: neutral-400 (#eeeff0), border: 1px neutral-500 (#e2e8f0),
 *               p: 4px (spacing/s), rounded-md, gap: 0
 *   Active tab → bg: white, rounded-md, shadow: 0px 1px 5px rgba(11,26,59,0.06)
 *   Inactive tab → bg: transparent
 *   Tab padding → px: 16px (spacing/xl), py: 8px (spacing/m)
 *   Active text → text-text-body (#374150)
 *   Inactive text → text-text-subheading (#828d9d)
 *   Font → subtitle.md: text-subtitle-md font-medium tracking-subtitle-md (globals.css)
 *
 * @example
 * ```tsx
 * <TabBar defaultValue="overview">
 *   <TabBarItem value="overview">Overview</TabBarItem>
 *   <TabBarItem value="details">Details</TabBarItem>
 *   <TabBarItem value="history">History</TabBarItem>
 * </TabBar>
 * ```
 */
const TabBar = forwardRef<HTMLDivElement, TabBarProps>(
  ({ defaultValue, value, onValueChange, className, children, ...props }, ref) => {
    const [internalValue, setInternalValue] = useState(defaultValue);
    const activeTab = value ?? internalValue;

    const { setContainerRef, registerItem, indicator, hasInitialized, duration } =
      useSlidingIndicator(activeTab);

    const setActiveTab = (v: string) => {
      if (!value) setInternalValue(v);
      onValueChange?.(v);
    };

    return (
      <TabBarContext.Provider value={{ activeTab, setActiveTab, registerTab: registerItem }}>
        <div
          ref={(node) => {
            setContainerRef(node);
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          role="tablist"
          className={cn(
            'relative inline-flex w-fit self-start items-center gap-0 p-1 rounded-md h-11',
            'bg-neutral-400 border border-neutral-500',
            className,
          )}
          {...props}
        >
          {/* Sliding indicator */}
          <div
            className={cn(
              'absolute top-1 rounded-md bg-white shadow-[0px_1px_5px_0px_rgba(11,26,59,0.06)]',
              hasInitialized ? 'transition-all ease-[cubic-bezier(0.4,0,0.2,1)]' : '',
            )}
            style={{
              left: `${indicator.left}px`,
              width: `${indicator.width}px`,
              height: 'calc(100% - 8px)',
              transitionDuration: hasInitialized ? `${duration}ms` : '0ms',
            }}
          />
          {children}
        </div>
      </TabBarContext.Provider>
    );
  },
);

TabBar.displayName = 'TabBar';

/* ─────────────────────────────────────────────────────────────────────────── */
/*  TabBarItem                                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

export interface TabBarItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Must match a value to link with content */
  value: string;
  children: ReactNode;
}

const TabBarItem = forwardRef<HTMLButtonElement, TabBarItemProps>(
  ({ className, value, children, ...props }, ref) => {
    const { activeTab, setActiveTab, registerTab } = useTabBarContext();
    const isActive = activeTab === value;
    const btnRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
      registerTab(value, btnRef.current);
      return () => registerTab(value, null);
    }, [value, registerTab]);

    return (
      <button
        ref={(node) => {
          btnRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.RefObject<HTMLButtonElement | null>).current = node;
        }}
        role="tab"
        type="button"
        aria-selected={isActive}
        data-state={isActive ? 'active' : 'inactive'}
        className={cn(
          'relative z-[1] inline-flex items-center justify-center gap-1 px-4 py-2 rounded-md h-9 text-subtitle-sm!',
          'transition-colors duration-300',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          isActive
            ? 'font-medium tracking-subtitle-md whitespace-nowrap text-text-body'
            : 'bg-transparent text-text-subheading font-medium tracking-subtitle-md whitespace-nowrap',
          className,
        )}
        onClick={() => setActiveTab(value)}
        {...props}
      >
        {children}
      </button>
    );
  },
);

TabBarItem.displayName = 'TabBarItem';

export { TabBar, TabBarItem };
