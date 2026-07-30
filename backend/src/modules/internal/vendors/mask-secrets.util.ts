// Keys whose string values are vendor credentials / signed tokens and must
// never reach the internal call-log UI. Matched case-insensitively as a
// substring so `app_secret`, `X-Api-Key`, `clientSecret` etc. are all caught.
const SENSITIVE_KEY_PATTERN =
  /(token|secret|authorization|api[-_ ]?key|app[-_ ]?id|appid|password|passcode|signature)/i;

function maskString(value: string): string {
  if (value.length <= 6) {
    return '***';
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

/**
 * Deep-clones a JSON value, masking the string values of any sensitive-looking
 * keys. Used on request payloads before they're returned by the call-detail
 * endpoint. Non-string sensitive values (rare) are passed through untouched.
 */
export function maskSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => maskSecrets(entry));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] =
        SENSITIVE_KEY_PATTERN.test(key) && typeof child === 'string'
          ? maskString(child)
          : maskSecrets(child);
    }
    return out;
  }
  return value;
}
