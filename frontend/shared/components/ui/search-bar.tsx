'use client';

import {
  forwardRef,
  useState,
  useCallback,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { X } from 'lucide-react';
import { Menu, type MenuOption } from '@/shared/components/ui/menu';
import { cn } from '@/shared/lib/utils';
import searchIcon from '@/public/assets/icons/search-magnifying-glass/Search_Magnifying_Glass=16px.svg'
import { SvgIcon } from './svg-icon';
import { TextType } from './text-type';


/* ═══════════════════════════════════════════════════════════════════════════
 * RDS SearchBar — Figma nodes 3130:1883 (all states) & 3130:2697 (Search Model)
 *
 * Token mapping:
 *   Container: bg-white, rounded-md (8px), p-2 (8px), gap-1 (4px)
 *   Width: w-[250px] (default, override via className)
 *
 *   Border colors per state:
 *     Default          → border-border-default (#eeeff0)
 *     Hover            → border-[#e2e8f0]  (neutral-500 / color/border/click-hover)
 *     Focused/Active   → border-[#456ec4]  (primary blue / color/border/active)
 *     Disabled         → border-border-disabled (#f3f4f7)
 *
 *   Search icon:
 *     Default/Hover/Focused/Disabled → text-icon-muted
 *     Active (has value) / Filled    → text-icon-default
 *
 *   Value text: text-body-md font-normal text-text-body
 *   Placeholder: text-body-md font-normal text-text-disabled
 *   Clear (X): size-4, text-icon-muted → hover text-text-body
 *
 *   Suggestions dropdown (Search Model, Figma 3130:2697):
 *     Container: bg-white, border-neutral-300, rounded-md
 *     Shadow: 0px 1px 5px rgba(11,26,59,0.06)
 *     Py-1, items px-1 py-0.5, content p-2
 *     Text: text-body-md font-medium text-text-body
 *     Highlighted item (1st / hovered): bg-neutral-200
 *     Matched portion (typed): text-text-body
 *     Hint portion (untyped): text-text-subheading (#828d9d)
 *
 * @example
 * ```tsx
 * // Standalone search bar
 * <SearchBar
 *   value={query}
 *   onChange={setQuery}
 *   onClear={() => setQuery('')}
 *   placeholder="Search users..."
 * />
 *
 * // With recent-search suggestions
 * <SearchBar
 *   value={query}
 *   onChange={setQuery}
 *   onClear={() => setQuery('')}
 *   suggestions={recentSearches}
 *   onSuggestionSelect={(s) => setQuery(s.label)}
 * />
 *
 * // With autocomplete hints (matched portion bold, hint text greyed)
 * <SearchBar
 *   value={query}
 *   onChange={setQuery}
 *   onClear={() => setQuery('')}
 *   suggestions={[
 *     { id: 1, label: 'John Doe',     matchedPart: 'John' },
 *     { id: 2, label: 'Johnson Rider', matchedPart: 'John' },
 *   ]}
 *   onSuggestionSelect={(s) => setQuery(s.label)}
 * />
 * ```
 * ═══════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────── */
/*  Types                                                                  */
/* ─────────────────────────────────────────────────────────────────────── */

export interface SearchSuggestion {
  id: string | number;
  /** Full display label */
  label: string;
  /**
   * The already-typed portion of the label (shown in text-text-body).
   * The remainder `label.slice(matchedPart.length)` is shown in text-text-subheading.
   * When undefined, the full label is shown as text-text-body (recent search style).
   */
  matchedPart?: string;
}

export interface SearchBarProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'> {
  value?: string;
  onChange?: (value: string) => void;
  onClear?: () => void;
  /** Enable the built-in animated “meaningful suggestions” placeholder */
  enableAnimatedSuggestions?: boolean;
  /** Which built-in suggestion set to animate (kept in this file) */
  animatedSuggestionsPreset?: 'client' | 'client-postpaid' | 'internal';
  /** Optional animated placeholder phrases shown while input is empty */
  animatedSuggestions?: string[];
  /** Autocomplete suggestions — shown in a dropdown while focused */
  suggestions?: SearchSuggestion[];
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void;
  /** Index of the keyboard-highlighted suggestion (-1 = none) */
  highlightedIndex?: number;
  containerClassName?: string;
}

const CLIENT_ANIMATED_SUGGESTIONS = [
  'Candidates: name, email, position',
  'Users: name, email, access, phone',
  'Settings: company, email template, integrations',
  'Billing, credits transactions, packages',
  'Add candidate or bulk upload',
];

// Postpaid clients have no credits — same hints, rupee-era billing wording.
const CLIENT_POSTPAID_ANIMATED_SUGGESTIONS = [
  'Candidates: name, email, position',
  'Users: name, email, access, phone',
  'Settings: company, email template, integrations',
  'Billing, transactions, invoices, packages',
  'Add candidate or bulk upload',
];

const INTERNAL_ANIMATED_SUGGESTIONS = [
  'Clients: name, industry, GST',
  'Add client (opens create modal)',
  'Packages & checks (slots, pricing)',
  'Operations (queues, alerts, health)',
  'Search by company email or website',
];

/* ─────────────────────────────────────────────────────────────────────── */
/*  SearchBar                                                              */
/* ─────────────────────────────────────────────────────────────────────── */

const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  (
    {
      className,
      placeholder = 'Search',
      value = '',
      onChange,
      onClear,
      enableAnimatedSuggestions = false,
      animatedSuggestionsPreset = 'client',
      animatedSuggestions = [],
      disabled,
      suggestions = [],
      onSuggestionSelect,
      onKeyDown,
      containerClassName,
      ...props
    },
    ref,
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [localHighlight, setLocalHighlight] = useState(-1);

    const isFilled = value.length > 0;
    const showDropdown = isFocused && suggestions.length > 0;

    const suggestionsToAnimate = enableAnimatedSuggestions
      ? animatedSuggestionsPreset === 'internal'
        ? INTERNAL_ANIMATED_SUGGESTIONS
        : animatedSuggestionsPreset === 'client-postpaid'
          ? CLIENT_POSTPAID_ANIMATED_SUGGESTIONS
          : CLIENT_ANIMATED_SUGGESTIONS
      : animatedSuggestions;

    const shouldAnimatePlaceholder =
      suggestionsToAnimate.length > 0 && !isFilled && !disabled;

    /* Border color follows state priority: focused > hover > default */
    const borderClass = disabled
      ? 'border-border-disabled'
      : isFocused
        ? 'border-[#456ec4]'
        : isHovered
          ? 'border-[var(--color-border-hover)]'
          : 'border-border-default';

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLInputElement>) => {
        if (!showDropdown) {
          onKeyDown?.(e);
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setLocalHighlight((h) => Math.min(h + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setLocalHighlight((h) => Math.max(h - 1, 0));
        } else if (e.key === 'Enter' && localHighlight >= 0) {
          e.preventDefault();
          onSuggestionSelect?.(suggestions[localHighlight]);
          setLocalHighlight(-1);
        } else if (e.key === 'Escape') {
          setIsFocused(false);
        }
        onKeyDown?.(e);
      },
      [showDropdown, suggestions, localHighlight, onSuggestionSelect, onKeyDown],
    );

    return (
      <div
        className={cn('relative', className)}
        onMouseEnter={() => !disabled && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* ── Input row ─────────────────────────────────────────── */}
        <div
          className={cn(
            'flex items-center gap-1 bg-white border rounded-md p-2 h-9 w-62.5',
            borderClass,
            disabled && 'opacity-50 cursor-not-allowed',
            containerClassName,
          )}
        >
          <SvgIcon src={searchIcon} color={isFilled || isFocused ? 'text-icon-default' : 'text-icon-muted'} alt="Search" />

          <div className="relative flex-1 min-w-0">
            {shouldAnimatePlaceholder && (
              <TextType
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center pr-2',
                  'text-sm font-normal leading-[20px] tracking-normal text-text-disabled',
                  '[&>span:first-child]:truncate [&>span:first-child]:overflow-visible [&>span:first-child]:max-w-full [&>span:first-child]:inline-block',
                  isFocused && 'opacity-90',
                )}
                text={suggestionsToAnimate}
                as="span"
                typingSpeed={70}
                deletingSpeed={45}
                pauseDuration={1800}
                loop
                showCursor
                cursorCharacter="|"
                cursorClassName="ml-[1px] text-xl animate-pulse text-black"
              >
                {placeholder}
              </TextType>
            )}

            <input
              ref={ref}
              type="text"
              value={value}
              placeholder={shouldAnimatePlaceholder ? '' : placeholder}
              disabled={disabled}
              onChange={(e) => onChange?.(e.target.value)}
              onFocus={() => {
                setIsFocused(true);
                setLocalHighlight(-1);
              }}
              onBlur={() => {
                setIsFocused(false);
                setLocalHighlight(-1);
              }}
              onKeyDown={handleKeyDown}
              className={cn(
                'relative z-[1] flex-1 min-w-0 w-full bg-transparent outline-none',
                'text-sm! font-normal leading-[20px] tracking-body-md',
                // Explicit `placeholder:text-sm!` so the placeholder can't
                // silently drift to a different size via a conflicting
                // inherited rule — matches the 14 px the typed value uses.
                'text-text-body placeholder:text-sm! placeholder:text-text-disabled',
                disabled && 'cursor-not-allowed',
              )}
              {...props}
            />
          </div>

          {/* Clear button — visible when filled */}
          {isFilled && !disabled && (
            <button
              type="button"
              aria-label="Clear search"
              onMouseDown={(e) => e.preventDefault()} // keep focus on input
              onClick={onClear}
              className="shrink-0 size-4 flex items-center justify-center text-black hover:text-black transition-colors"
              tabIndex={-1}
            >
              <X className="size-3.5 text-black" />
            </button>
          )}
        </div>

        {/* ── Suggestions dropdown (Search Model via Menu/MenuItem) ───────── */}
        {showDropdown && (
          <Menu
            className="absolute top-full left-0 mt-1 z-50 w-full min-w-[250px]"
            items={suggestions.map((suggestion, idx) => {
              const isHighlighted = idx === localHighlight || (localHighlight === -1 && idx === 0);
              const hintPart =
                suggestion.matchedPart != null
                  ? suggestion.label.slice(suggestion.matchedPart.length)
                  : null;

              const item: MenuOption = {
                id: String(suggestion.id),
                state: isHighlighted ? 'On Hover' : 'Default',
                menuText: suggestion.label,
                labelContent:
                  hintPart != null ? (
                    <span className="text-body-md font-medium leading-[20px] tracking-body-md">
                      <span className="text-text-body">{suggestion.matchedPart}</span>
                      <span className="text-text-subheading">{hintPart}</span>
                    </span>
                  ) : undefined,
                onMouseDown: (e) => e.preventDefault(), // keep focus on input
                onMouseEnter: () => setLocalHighlight(idx),
                onClick: () => {
                  onSuggestionSelect?.(suggestion);
                  setLocalHighlight(-1);
                },
              };
              return item;
            })}
          />
        )}
      </div>
    );
  },
);

SearchBar.displayName = 'SearchBar';

export { SearchBar };
