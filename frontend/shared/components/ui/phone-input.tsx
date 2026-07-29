'use client';

import * as React from 'react';
import { CheckIcon } from 'lucide-react';
import * as RPNInput from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';

import { getCountryCallingCode, getExampleNumber, isValidPhoneNumber } from 'libphonenumber-js';

/**
 * Coerce a raw phone string into E.164 (`+91…`). RPNInput refuses to
 * accept anything else and warns + ignores the value otherwise. Legacy
 * records sometimes hold national-format strings (`"9800000000"`) — for
 * those we prefix with the `defaultCountry` dial code. Already-E.164
 * values pass through; empty/garbage returns undefined.
 */
function normalizeToE164(
  value: unknown,
  defaultCountry?: RPNInput.Country,
): RPNInput.Value | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const trimmed = value.trim();
  if (trimmed.startsWith('+')) return trimmed as RPNInput.Value;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return undefined;
  if (!defaultCountry) return undefined;
  try {
    return `+${getCountryCallingCode(defaultCountry)}${digits}` as RPNInput.Value;
  } catch {
    return undefined;
  }
}
import examples from 'libphonenumber-js/examples.mobile.json';
import { cn } from '@/shared/lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import chevronDownIcon from '@/public/assets/icons/chevron-down-medium/Chevron_Down_Medium=16px.svg'
import { SvgIcon } from './svg-icon';

/**
 * RDS PhoneInput — Figma node 3172:2444 (type = "Number").
 *
 * Token mapping:
 *   Country-code box (left):
 *     border: border-default (#eeeff0), rounded-l-md only
 *     px: 12px (spacing/l) left, 8px (spacing/m) right
 *     py: 8px (spacing/m)
 *     text: text-body-md, font-normal, text-text-body
 *     ChevronDown: 16px icon
 *     Active: border-focused (#174ab5)
 *
 *   Number box (right):
 *     border: right/top/bottom only, border-default, rounded-r-md
 *     px: 12px, py: 8px
 *     text: text-body-md, font-normal
 *     Placeholder: text-text-disabled
 *     Filled: text-text-body
 *
 *   Error/disabled/readonly follow the same input-field patterns.
 *
 *   Country dropdown popover:
 *     bg: white, border: neutral-500, shadow-100, rounded-md
 *     Items: text-body-md font-medium text-text-body
 *     Flag: 24×16, rounded-sm
 *
 * @example
 * ```tsx
 * <PhoneInput value={phone} onChange={setPhone} defaultCountry="IN" />
 * ```
 */

type PhoneInputProps = Omit<
  React.ComponentProps<'input'>,
  'onChange' | 'value' | 'ref'
> &
  Omit<RPNInput.Props<typeof RPNInput.default>, 'onChange'> & {
    onChange?: (value: RPNInput.Value) => void;
    error?: boolean;
  };

// `react-phone-number-input` passes only the standard HTML input props to
// the `inputComponent`, so the outer `error` prop can't travel through as
// a normal prop. A context bridges it — the outer `PhoneInput` publishes
// the current `error` value and `BasePhoneNumberInput` consumes it so the
// number input picks up the failure border alongside the country select.
const PhoneInputErrorContext = React.createContext(false);
const PhoneInputCountryContext = React.createContext<RPNInput.Country | undefined>(undefined);

/** Max digit count for the country's national number (e.g. 10 for India). */
function getMaxLength(country?: RPNInput.Country): number {
  if (!country) return 15;
  try {
    const example = getExampleNumber(country, examples);
    const nationalNumberLength = example?.nationalNumber?.length;
    return nationalNumberLength ? nationalNumberLength + 2 : 15;
  } catch {
    return 15;
  }
}

const BasePhoneNumberInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<'input'>
>((props, ref) => {
  const error = React.useContext(PhoneInputErrorContext);
  const country = React.useContext(PhoneInputCountryContext);
  const maxLength = getMaxLength(country);
  return <PhoneNumberInput {...props} ref={ref} error={error} maxLength={maxLength} />;
});
BasePhoneNumberInput.displayName = 'BasePhoneNumberInput';

const PhoneInput: React.ForwardRefExoticComponent<PhoneInputProps> =
  React.forwardRef<React.ElementRef<typeof RPNInput.default>, PhoneInputProps>(
    ({ className, onChange, value, error, disabled, readOnly, defaultCountry, ...props }, ref) => {
      const [selectedCountry, setSelectedCountry] = React.useState<RPNInput.Country | undefined>(defaultCountry as RPNInput.Country | undefined);

      return (
        <PhoneInputErrorContext.Provider value={Boolean(error)}>
          <PhoneInputCountryContext.Provider value={selectedCountry}>
            <RPNInput.default
              ref={ref}
              className={cn('flex', className)}
              flagComponent={FlagComponent}
              countrySelectComponent={(selectProps) => (
                <CountrySelect
                  {...selectProps}
                  disabled={disabled}
                  readOnly={readOnly}
                  error={error}
                />
              )}
              inputComponent={BasePhoneNumberInput}
              smartCaret={false}
              value={normalizeToE164(value, defaultCountry as RPNInput.Country | undefined)}
              onChange={(v) => onChange?.(v || ('' as RPNInput.Value))}
              onCountryChange={(country) => setSelectedCountry(country)}
              disabled={disabled}
              readOnly={readOnly}
              defaultCountry={defaultCountry}
              {...props}
            />
          </PhoneInputCountryContext.Provider>
        </PhoneInputErrorContext.Provider>
      );
    },
  );

PhoneInput.displayName = 'PhoneInput';

/* ─── Internal: the right-side number input ────────────────────────────── */

interface PhoneNumberInputProps extends React.ComponentProps<'input'> {
  error?: boolean;
  maxLength?: number;
}

const PhoneNumberInput = React.forwardRef<HTMLInputElement, PhoneNumberInputProps>(
  ({ className, error, disabled, readOnly, maxLength = 15, ...props }, ref) => (
    <input
      ref={ref}
      disabled={disabled}
      readOnly={readOnly}
      maxLength={maxLength}
      autoComplete="tel-national"
      className={cn(
        'flex-1 min-w-0 h-9',
        'border border-border-default rounded-r-md',
        'px-3 py-2 bg-white',
        'text-sm font-normal leading-[20px] tracking-body-md',
        'text-text-body placeholder:text-sm placeholder:text-text-disabled',
        'outline-none transition-colors',
        !error && 'focus:border-border-focused! hover:border-border-hover',
        error && 'border-border-failure hover:border-border-failure focus:border-border-failure!',
        disabled && 'border-border-disabled cursor-not-allowed',
        readOnly && 'bg-neutral-300 border-border-default text-text-subheading cursor-default',
        className,
      )}
      {...props}
    />
  ),
);

PhoneNumberInput.displayName = 'PhoneNumberInput';

/* ─── Internal: the left-side country code selector ────────────────────── */

type CountryEntry = { label: string; value: RPNInput.Country | undefined };

type CountrySelectProps = {
  disabled?: boolean;
  readOnly?: boolean;
  value: RPNInput.Country;
  options: CountryEntry[];
  onChange: (country: RPNInput.Country) => void;
  error?: boolean;
};

function CountrySelect({
  disabled,
  readOnly,
  value: selectedCountry,
  options: countryList,
  onChange,
  error,
}: CountrySelectProps) {
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);
  const [searchValue, setSearchValue] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <Popover
      open={readOnly ? false : isOpen}
      modal
      onOpenChange={(open) => {
        if (readOnly) return;
        setIsOpen(open);
        if (open) setSearchValue('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled || readOnly}
          className={cn(
            'flex items-center gap-0.5 h-9 shrink-0',
            'border border-border-default rounded-l-md',
            'pl-3 pr-2 py-2 bg-white',
            'text-sm font-normal text-text-body',
            'outline-none transition-colors',
            !readOnly && 'data-[state=open]:border-border-focused!',
            !disabled && !readOnly && !error && 'hover:border-border-hover',
            !disabled && !readOnly && !error && 'focus:border-border-focused',
            error && 'border-border-failure',
            disabled && 'border-border-disabled cursor-not-allowed opacity-50',
            readOnly && 'bg-neutral-300 border-border-default text-text-subheading cursor-default',
          )}
        >
          <FlagComponent country={selectedCountry} countryName={selectedCountry} />
          <span className="ml-1">
            +{selectedCountry ? RPNInput.getCountryCallingCode(selectedCountry) : ''}
          </span>
          {!disabled && !readOnly && (
            <SvgIcon
              src={chevronDownIcon}
              color="text-icon-muted"
              alt="Chevron Down"
              className={cn(
                'transition-transform duration-400',
                isOpen && '-rotate-180',
              )}
            />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[300px] p-0 bg-white border border-neutral-500 rounded-md shadow-[0px_1px_5px_0px_rgba(11,26,59,0.06)]"
        align="start"
      >
        <Command>
          <CommandInput
            value={searchValue}
            onValueChange={(v) => {
              setSearchValue(v);
              setTimeout(() => {
                if (scrollAreaRef.current) {
                  const viewport = scrollAreaRef.current.querySelector(
                    '[data-radix-scroll-area-viewport]',
                  );
                  if (viewport) viewport.scrollTop = 0;
                }
              }, 0);
            }}
            placeholder="Search country..."
          />
          <CommandList>
            <ScrollArea ref={scrollAreaRef} className="h-72">
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {countryList.map(({ value, label }) =>
                  value ? (
                    <CommandItem
                      key={value}
                      className="gap-2 text-body-md text-text-body"
                      onSelect={() => {
                        onChange(value);
                        setIsOpen(false);
                      }}
                    >
                      <FlagComponent country={value} countryName={label} />
                      <span className="flex-1 text-sm">{label}</span>
                      <span className="text-sm text-text-subheading">
                        +{RPNInput.getCountryCallingCode(value)}
                      </span>
                      <CheckIcon
                        className={cn(
                          'ml-auto size-4',
                          value === selectedCountry ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    </CommandItem>
                  ) : null,
                )}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ─── Internal: flag renderer ──────────────────────────────────────────── */

function FlagComponent({ country, countryName }: RPNInput.FlagProps) {
  const Flag = flags[country];

  return (
    <span className="flex h-4 w-6 overflow-hidden rounded-sm bg-neutral-400 [&_svg:not([class*='size-'])]:size-full">
      {Flag && <Flag title={countryName} />}
    </span>
  );
}

/**
 * Validates a phone number string using libphonenumber-js.
 * Returns null if valid, or an error message string if invalid.
 * Use this in form submit/next handlers to show validation errors.
 *
 * @example
 * ```ts
 * const error = validatePhoneNumber(phoneValue);
 * if (error) setPhoneError(error);
 * ```
 */
function validatePhoneNumber(value: string | undefined | null): string | null {
  if (!value || value.trim().length === 0) return null; // empty is handled by "required" validation
  const phoneStr = String(value);
  if (isValidPhoneNumber(phoneStr)) return null;
  return 'Please enter a valid phone number';
}

export { PhoneInput, validatePhoneNumber, type PhoneInputProps };
