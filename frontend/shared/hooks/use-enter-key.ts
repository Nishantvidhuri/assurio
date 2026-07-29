import { useEffect, type RefObject } from 'react';

interface UseEnterKeyOptions {
  /**
   * Disable the listener without unmounting the consumer. Handy for
   * gating Enter on form-validity, submission state, etc.
   * @default true
   */
  enabled?: boolean;

  /**
   * If provided, only Enter presses where the event target lives inside
   * this element will fire `handler`. Use this to scope the shortcut to
   * a single form / panel / dialog so background inputs elsewhere on the
   * page can't trigger it.
   *
   * Without `scopeRef` the shortcut is global (document-level).
   */
  scopeRef?: RefObject<HTMLElement | null>;

  /**
   * Skip the handler when the event happens inside a `<textarea>`, a
   * `contenteditable` element, or any control whose `data-allow-enter`
   * attribute opts out. Defaults to true so multi-line inputs keep their
   * native newline behavior.
   * @default true
   */
  ignoreMultilineFields?: boolean;

  /**
   * When true, Enter presses combined with a modifier (Shift / Ctrl /
   * Meta / Alt) are ignored. Most "press Enter to submit" flows want
   * this so Shift+Enter in adjacent textareas doesn't double-fire.
   * @default true
   */
  ignoreWithModifiers?: boolean;
}

function isInsideMultilineField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === 'TEXTAREA') return true;
  if (target.isContentEditable) return true;
  if (target.closest('[data-allow-enter="true"]')) return true;
  return false;
}

/**
 * Fires `handler` when the user presses Enter. Reusable across forms,
 * dialogs, and any panel that wants a "press Enter to confirm" shortcut.
 *
 * @example
 * ```tsx
 * useEnterKey(handleSubmit, { enabled: !isSubmitting });
 * ```
 *
 * @example Scoped to a single form so other inputs on the page don't trigger it:
 * ```tsx
 * const formRef = useRef<HTMLDivElement>(null);
 * useEnterKey(handleSubmit, { scopeRef: formRef, enabled: !isSubmitting });
 * return <div ref={formRef}>{ ... }</div>;
 * ```
 */
export function useEnterKey(
  handler: (event: KeyboardEvent) => void,
  options: UseEnterKeyOptions = {},
) {
  const {
    enabled = true,
    scopeRef,
    ignoreMultilineFields = true,
    ignoreWithModifiers = true,
  } = options;

  useEffect(() => {
    if (!enabled) return;

    const listener = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;

      // IME composition (e.g. typing CJK) — Enter here commits the
      // candidate, not the form. Browsers report `keyCode === 229` /
      // `isComposing === true` for those.
      if (event.isComposing || event.keyCode === 229) return;

      if (ignoreWithModifiers && (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)) {
        return;
      }

      if (ignoreMultilineFields && isInsideMultilineField(event.target)) {
        return;
      }

      if (scopeRef?.current) {
        const target = event.target as Node | null;
        if (!target || !scopeRef.current.contains(target)) return;
      }

      handler(event);
    };

    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [enabled, handler, ignoreMultilineFields, ignoreWithModifiers, scopeRef]);
}
