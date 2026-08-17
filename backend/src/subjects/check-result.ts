/**
 * Shape helpers for a stored check result. One place, so the engine, the
 * progress count and both report renderers can never disagree about what a
 * result means.
 *
 * A check result is one of:
 *   • vendor data          — the source answered
 *   • { __checkError }     — the source failed / found nothing. UNRESOLVED:
 *                            an operator has to decide what happens next. The
 *                            client is shown "In progress" and the
 *                            verification does NOT count as complete.
 *   • { __checkError, __resolvedAt } — an operator released that failure to
 *                            the client, who now sees "Unable to verify".
 *                            Terminal.
 *   • { __manualOverride } — an operator verified it by hand. Terminal, and
 *                            labelled so the report never implies the source
 *                            confirmed it.
 */

export interface ManualOverride {
  passedBy: string;
  passedAt: string;
  reason: string | null;
}

export function errorOf(result: unknown): string | null {
  return result && typeof result === 'object' && '__checkError' in result
    ? String((result as { __checkError: unknown }).__checkError)
    : null;
}

export function manualOf(result: unknown): ManualOverride | null {
  if (!result || typeof result !== 'object' || !('__manualOverride' in result)) {
    return null;
  }
  const m = result as { passedBy?: unknown; passedAt?: unknown; reason?: unknown };
  return {
    passedBy: String(m.passedBy ?? 'an administrator'),
    passedAt: String(m.passedAt ?? ''),
    reason: m.reason ? String(m.reason) : null,
  };
}

/** True once an operator has released a failure to the client. */
export function isResolvedFailure(result: unknown): boolean {
  return Boolean(
    errorOf(result) &&
      typeof result === 'object' &&
      result !== null &&
      '__resolvedAt' in result,
  );
}

/**
 * A failure still sitting with the operations team. The client sees the check
 * as in progress, and the verification is not complete until it's resolved —
 * either passed manually or released as "Unable to verify".
 */
export function isUnresolvedFailure(result: unknown): boolean {
  return Boolean(errorOf(result)) && !isResolvedFailure(result);
}

/** A result that ends the check: vendor data, manual pass, or a released failure. */
export function isTerminal(result: unknown): boolean {
  if (!result) return false;
  return !isUnresolvedFailure(result);
}
