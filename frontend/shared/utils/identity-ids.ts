// Masking for government identity numbers shown to CLIENT users (the
// internal queue keeps full values). Mirrors the SurePass masked-Aadhaar
// style ("XXXXXXXX1234") and the server-side report masking in
// server/src/modules/candidate-report/identity-report-comparison.util.ts —
// keep the key pattern and mask shape in sync.

// Matches the trailing key segment, so it covers flat response keys
// ('identity.aadhaar.documentNumber'), instance value keys
// ('criminal.panNumber') and vendor extracted-data keys ('aadhaarNumber').
// Deliberately excludes uanNumber — the client supplies the UAN themselves
// at case creation and works with it (search, edit), so it stays visible.
const IDENTITY_ID_KEY_PATTERN =
  /(documentNumber|panNumber|aadhaarNumber|passportNumber|epicNumber|licenseNumber|fileNumber)$/i;

// Every alphanumeric except the last four becomes 'X'; separators stay.
// Values with four or fewer alphanumerics mask entirely.
export function maskIdentityId(value: string): string {
  const chars = value.split('');
  const isAlnum = (c: string) => /[a-z0-9]/i.test(c);
  const alnumIndexes = chars
    .map((c, i) => (isAlnum(c) ? i : -1))
    .filter((i) => i >= 0);
  const visible = new Set(
    alnumIndexes.length > 4 ? alnumIndexes.slice(-4) : [],
  );
  return chars
    .map((c, i) => (isAlnum(c) && !visible.has(i) ? 'X' : c))
    .join('');
}

function walk(value: unknown, key: string | null): unknown {
  if (typeof value === 'string') {
    return key && IDENTITY_ID_KEY_PATTERN.test(key)
      ? maskIdentityId(value)
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => walk(entry, key));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        walk(v, k),
      ]),
    );
  }
  return value;
}

// Deep copy with every identity-ID string masked, wherever it sits in the
// payload (submitted response values, per-instance values, vendor extracted
// data). Plain JSON data only.
export function deepMaskIdentityIds<T>(input: T): T {
  return walk(input, null) as T;
}
