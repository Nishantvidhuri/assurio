'use client';

import {
  forwardRef,
  useState,
  useRef,
  useEffect,
  useCallback,
  type HTMLAttributes,
} from 'react';
import { cn } from '@/shared/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover';
import { SvgIcon } from './svg-icon';
import { useIsMobileOrTablet } from '@/shared/hooks/use-media-query';
import chevronDownIcon from '@/public/assets/icons/chevron-down-medium/Chevron_Down_Medium=16px.svg'

/**
 * RDS SelectInput — Figma node 3172:2444 (type = "Dropdown").
 *
 * Token mapping:
 *   Input box: h-9, pl-3 (12px = spacing/l), pr-2 (8px = spacing/m),
 *              py-2 (8px), rounded-md, border 1px, gap-0.5
 *   Placeholder text: text-text-disabled, text-body-md, font-normal
 *   Filled text: text-text-body, text-body-md, font-normal
 *   Icon: ChevronDown 16px (closed), ChevronUp 16px (open)
 *   Border states: same as InputField
 *
 *   Dropdown popover (Figma "Active" state):
 *     bg: white, border: neutral-500, rounded-md
 *     shadow: 0px 1px 5px rgba(11,26,59,0.06)
 *     Items: px-3 py-2, text-body-md font-medium text-text-body
 *     hover item: bg-neutral-400
 *
 * @example
 * ```tsx
 * <SelectInput
 *   options={[
 *     { label: 'Option A', value: 'a' },
 *     { label: 'Option B', value: 'b' },
 *   ]}
 *   value={selected}
 *   onChange={setSelected}
 *   placeholder="Select..."
 * />
 * ```
 */

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectInputProps extends Omit<HTMLAttributes<HTMLButtonElement>, 'onChange'> {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  error?: boolean;
}

const SelectInput = forwardRef<HTMLButtonElement, SelectInputProps>(
  (
    {
      className,
      options,
      value,
      onChange,
      placeholder = 'Select...',
      disabled = false,
      readOnly = false,
      error = false,
      ...props
    },
    ref,
  ) => {
    const [open, setOpen] = useState(false);
    const isMobileOrTablet = useIsMobileOrTablet();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [triggerWidth, setTriggerWidth] = useState<number | undefined>(undefined);

    const selectedOption = options.find((o) => o.value === value);
    const canOpen = !disabled && !readOnly;

    const setRefs = useCallback(
      (node: HTMLButtonElement | null) => {
        triggerRef.current = node;
        setTriggerWidth(node?.offsetWidth);

        if (!ref) return;
        if (typeof ref === 'function') {
          ref(node);
        } else {
          ref.current = node;
        }
      },
      [ref],
    );

    useEffect(() => {
      if (!open) return;
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setOpen(false);
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open]);

    useEffect(() => {
      if (!triggerRef.current) return;

      const updateWidth = () => {
        setTriggerWidth(triggerRef.current?.offsetWidth);
      };

      updateWidth();
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }, []);

    return (
      <Popover open={canOpen ? open : false} onOpenChange={canOpen ? setOpen : undefined}>
        <PopoverTrigger asChild>
          <button
            ref={setRefs}
            type="button"
            disabled={disabled}
            className={cn(
              'flex items-center gap-0.5 h-9 w-full',
              'border rounded-md pl-3 pr-2 py-2',
              'transition-colors duration-150',
              'outline-none',
              error
                ? 'border-border-failure'
                : disabled
                  ? 'border-border-disabled bg-white cursor-not-allowed'
                  : readOnly
                    ? 'bg-neutral-300 border-border-default cursor-default'
                    : 'border-border-default hover:border-border-hover cursor-pointer',
              open && !error && 'border-border-focused!',
              !disabled && !readOnly && !error && 'focus:border-border-focused!',
              className,
            )}
            {...props}
          >
            <span
              className={cn(
                'flex-1 text-left text-sm font-normal leading-[20px] tracking-body-md truncate',
                selectedOption ? 'text-text-body' : 'text-text-disabled',
              )}
            >
              {selectedOption?.label ?? placeholder}
            </span>

            <span className={cn('inline-flex transition-transform duration-400', open && '-rotate-180')}>
              <SvgIcon src={chevronDownIcon} color='text-icon-muted' alt='Chevron' />
            </span>
          </button>
        </PopoverTrigger>

        <PopoverContent
          className="p-0 bg-white border border-neutral-500 rounded-md shadow-[0px_1px_5px_0px_rgba(11,26,59,0.06)] animate-[menuSlideIn_400ms_ease-out] data-[state=closed]:animate-[menuSlideOut_400ms_ease-out]"
          align="start"
          style={triggerWidth ? { width: triggerWidth } : undefined}
          onInteractOutside={(event) => {
            if (isMobileOrTablet) {
              event.preventDefault();
            }
          }}
        >
          <div className="max-h-61.25 overflow-y-auto py-1">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'w-full px-3 py-2 text-left',
                  'text-sm font-medium leading-[20px] tracking-body-md text-text-body',
                  'transition-colors hover:bg-[var(--color-primary-bg)]',
                  option.value === value && 'bg-neutral-300',
                )}
                onClick={() => {
                  onChange?.(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);

SelectInput.displayName = 'SelectInput';

export { SelectInput };
