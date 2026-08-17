/**
 * Server-side renderer for a candidate's Background Verification Report — a 1:1
 * visual replica of Recriauth's report (Recriauth/server/src/modules/
 * candidate-report). Same Manrope type, navy ${BRAND.primaryDeep} section headers, 3-column
 * "Data Comparison" tables, pill status badges, cover + Verification Summary +
 * status legend, and the angled navy page-number footer banner.
 *
 * Content flows continuously (no fixed-height per-check pages), so short checks
 * pack together instead of each leaving a page-tall gap — the identity checks
 * are grouped into one "Identity Verification" section with numbered instances,
 * exactly like Recriauth. The per-page footer/page-number banner is emitted via
 * PdfService's Chromium header/footer (renderReportFooter) so page numbers are
 * real without a pdf-lib post-pass.
 */
import { ASSURIO_LOGO_DATA_URI } from './assurio-logo';
import { BRAND } from '../common/brand-colors';
import { resolveFatherName } from './bgv-address';
import { isUnresolvedFailure } from './check-result';
import {
  CREDIT_CHECK_ENABLED,
  PASSPORT_CHECK_ENABLED,
} from '../common/feature-flags';

/* ---------- input shape (superset of client + admin subject) ---------- */

export interface ReportSubject {
  id: string;
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  clientName?: string | null;
  caseRef?: string | null;
  amountPaid?: number | null;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  dob?: string | null;
  permanentAddress?: string | null;
  drivingLicense?: string | null;
  voterId?: string | null;
  passportFileNo?: string | null;
  uan?: string | null;
  panResult?: unknown;
  aadhaarResult?: unknown;
  crimeResult?: unknown;
  dlResult?: unknown;
  voterResult?: unknown;
  passportResult?: unknown;
  employmentResult?: unknown;
  creditResult?: unknown;
  panFront?: string | null;
  panBack?: string | null;
  aadhaarFront?: string | null;
  aadhaarBack?: string | null;
  crimeRequestId?: string | null;
  creditRequestId?: string | null;
  fatherName?: string | null;
  digilockerClientId?: string | null;
  /** Consent lifecycle — drives the "not started yet" wording below. */
  consentStatus?: 'PENDING' | 'GRANTED' | 'DECLINED' | 'EXPIRED' | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

type Dict = Record<string, unknown>;

type StatusKey =
  | 'completed'
  // Admin recorded the outcome by hand because the source could not answer.
  // A terminal PASS — it completes the check — but labelled distinctly so the
  // report never implies the source confirmed it.
  | 'manual'
  | 'discrepancy'
  | 'insufficiency'
  | 'in-progress'
  // Consent-gated: nothing has been sent to any source yet.
  | 'awaiting-consent'
  | 'not-started'
  | 'not-conducted';

// Labels + colours match the on-screen candidate report (our own status
// vocabulary), not Recriauth's. Internal keys are kept; a mismatch just reads
// as "Completed" here (the comparison table shows the discrepancy).
const STATUS_LABEL: Record<StatusKey, string> = {
  completed: 'Completed',
  manual: 'Verified manually',
  discrepancy: 'Completed',
  insufficiency: 'Unable to verify',
  'in-progress': 'In progress',
  'awaiting-consent': 'Awaiting consent',
  'not-started': 'Not started',
  'not-conducted': 'Not provided',
};
const STATUS_CLASS: Record<StatusKey, string> = {
  completed: 'completed', // green
  manual: 'manual', // amber — passed by an admin, not the source
  discrepancy: 'completed', // green
  insufficiency: 'insufficiency', // amber — could not be completed, not a finding
  'in-progress': 'pending', // blue
  'awaiting-consent': 'pending', // blue — waiting on the candidate
  'not-started': 'closed', // grey — consent declined/expired
  'not-conducted': 'closed', // grey
};
/** Roll several instance statuses up to a parent status (worst wins). */
function worstStatus(list: StatusKey[]): StatusKey {
  const order: StatusKey[] = [
    'insufficiency',
    'awaiting-consent',
    'not-started',
    'in-progress',
    'discrepancy',
    'manual',
    'completed',
    'not-conducted',
  ];
  for (const k of order) if (list.includes(k)) return k;
  return 'completed';
}

type MatchState = 'match' | 'partial' | 'mismatch' | 'na';
interface DataRow {
  label: string;
  provided: string;
  found: string;
  match: MatchState;
}
interface KV {
  label: string;
  value: string;
}
interface DocGroup {
  label: string;
  files: Array<{ name: string; url?: string | null }>;
}
interface Instance {
  number: number;
  title: string;
  status: StatusKey;
  dataRows: DataRow[];
  twoColRows: KV[];
  details: KV[];
  documents: DocGroup[];
  comment: string | null;
}

/* ---------- helpers ---------- */

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function errOf(r: unknown): string | null {
  return r && typeof r === 'object' && '__checkError' in r
    ? String((r as { __checkError: unknown }).__checkError)
    : null;
}
/** An admin manual override, or null. Mirrors the on-screen report. */
function manualOf(
  r: unknown,
): { passedBy: string; passedAt: string; reason: string | null } | null {
  if (!r || typeof r !== 'object' || !('__manualOverride' in r)) return null;
  const m = r as { passedBy?: unknown; passedAt?: unknown; reason?: unknown };
  return {
    passedBy: String(m.passedBy ?? 'an administrator'),
    passedAt: String(m.passedAt ?? ''),
    reason: m.reason ? String(m.reason) : null,
  };
}

/** Sentence shown on a manually-verified check. */
function manualComment(m: {
  passedBy: string;
  passedAt: string;
  reason: string | null;
}): string {
  const when = m.passedAt
    ? new Date(m.passedAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null;
  return (
    `The verification source could not return a result, so this check was ` +
    `verified manually by ${m.passedBy}${when ? ` on ${when}` : ''}.` +
    (m.reason ? ` Reason: ${m.reason}` : '')
  );
}

/**
 * What the client's report says when a check couldn't be completed. The raw
 * vendor message is deliberately never printed here — this PDF is delivered to
 * employers, and third-party stack traces don't belong in it. Admins see the
 * underlying error on the candidate screen instead.
 */
function unableToVerifyComment(raw: string): string {
  const t = (raw || '').toLowerCase();
  const systemish =
    /invalid url|no scheme|timeout|timed out|econn|network|unavailable|internal server|http 5\d\d|could not reach|failed to fetch|502|503|504/.test(
      t,
    );
  return systemish
    ? 'The verification source was temporarily unavailable, so this check could not be completed.'
    : 'No matching record was found for the details provided, so this check could not be completed.';
}

function norm(s?: string | null): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function last4(s?: string | null): string {
  return (s || '').replace(/\D/g, '').slice(-4);
}
function toDobParts(s?: string | null): string | null {
  if (!s) return null;
  const digits = s.match(/\d+/g);
  if (!digits || digits.length < 3) return null;
  let d: string, m: string, y: string;
  if (digits[0].length === 4) [y, m, d] = digits;
  else [d, m, y] = digits;
  return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
}
function rowMatchState(
  provided: string,
  found: string,
  kind: 'eq' | 'name' | 'dob',
): MatchState {
  if (!provided || !found || provided === '-' || found === '-') return 'na';
  if (kind === 'dob') {
    const a = toDobParts(provided);
    const b = toDobParts(found);
    if (!a || !b) return 'na';
    return a === b ? 'match' : 'mismatch';
  }
  if (kind === 'name') {
    if (norm(provided) === norm(found)) return 'match';
    const at = provided.toLowerCase().split(/\s+/).filter(Boolean);
    const bt = found.toLowerCase().split(/\s+/).filter(Boolean);
    const overlap = at.filter((t) => bt.includes(t)).length;
    if (overlap === 0) return 'mismatch';
    if (overlap === at.length || overlap === bt.length) return 'match';
    return 'partial';
  }
  return norm(provided) === norm(found) ? 'match' : 'mismatch';
}
/**
 * True when the stored Aadhaar KYC carries every address field the credit
 * bureau needs. Mirrors isCompleteStructuredAddress in bgv-address.ts — the
 * report must describe exactly the condition the engine gates on.
 */
function aadhaarAddressComplete(result: unknown): boolean {
  if (!result || typeof result !== 'object' || '__checkError' in result) {
    return false;
  }
  const address = (result as { address?: Record<string, unknown> }).address;
  if (!address || typeof address !== 'object') return false;
  const val = (k: string): string => String(address[k] ?? '').trim();
  const city = val('subDistrict') || val('district') || val('vtc');
  const street = ['house', 'street', 'locality', 'landmark']
    .map(val)
    .filter(Boolean)
    .join(', ');
  return Boolean(street && city && val('state') && val('pincode'));
}

/**
 * The vendor's own report file, when the API hands one back instead of (or
 * alongside) structured fields. KonnectNxt returns the credit report as a
 * hosted PDF URL in `data`; crime can carry one under a report/pdf key. We
 * surface it as a document so the reader gets the source report itself.
 */
function vendorReportUrl(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const isUrl = (v: unknown): v is string =>
    typeof v === 'string' && /^https?:\/\//i.test(v.trim());
  const o = result as Dict;
  if (isUrl(o.data)) return o.data.trim();
  const candidates = [o, unwrap(result)];
  for (const src of candidates) {
    for (const k of [
      'report_url',
      'reportUrl',
      'pdf_url',
      'pdfUrl',
      'report',
      'pdf',
      'url',
      'file_url',
    ]) {
      const v = (src as Dict)[k];
      if (isUrl(v)) return v.trim();
    }
  }
  return null;
}

function unwrap(r: unknown): Dict {
  if (!r || typeof r !== 'object') return {};
  const o = r as Dict;
  return o.data && typeof o.data === 'object' ? (o.data as Dict) : o;
}
function pick(o: Dict, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (typeof v === 'number') return String(v);
  }
  return '';
}
function genderLabel(g?: string | null): string {
  if (g === 'M') return 'Male';
  if (g === 'F') return 'Female';
  return g || '';
}
function iso(d?: Date | string | null): string | undefined {
  if (!d) return undefined;
  return d instanceof Date ? d.toISOString() : String(d);
}
function fmtDate(d?: Date | string | null): string {
  const s = iso(d);
  if (!s) return '-';
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}
function or(v?: string | number | null): string {
  const s = v === 0 ? '0' : String(v ?? '').trim();
  return s || '-';
}

/* ---------- instance builder (one ID document) ---------- */

function idInstance(
  number: number,
  title: string,
  input: {
    result: unknown;
    hasInput: boolean;
    pending: boolean;
    rows: Array<{ label: string; provided: string; found: string; kind: 'eq' | 'name' | 'dob' }>;
    details: KV[];
    documents: DocGroup[];
    /** Overrides the generic "underway with the source" text while pending. */
    pendingComment?: string;
  },
): Instance {
  const err = errOf(input.result);
  const manual = manualOf(input.result);
  const data = err || manual ? null : (input.result as Dict | null);
  let status: StatusKey;
  const dataRows: DataRow[] = [];
  let comment: string | null = null;

  if (err && isUnresolvedFailure(input.result)) {
    // The source failed and operations hasn't decided yet — the client sees the
    // check as still running, never the failure.
    status = 'in-progress';
    comment =
      input.pendingComment ??
      'Verification is currently underway with the respective source. The final outcome is yet to be determined.';
  } else if (err) {
    status = 'insufficiency';
    comment = unableToVerifyComment(err);
  } else if (manual) {
    status = 'manual';
    comment = manualComment(manual);
  } else if (data) {
    let anyMismatch = false;
    for (const r of input.rows) {
      const provided = or(r.provided);
      const found = or(r.found);
      const match = rowMatchState(provided, found, r.kind);
      dataRows.push({ label: r.label, provided, found, match });
      if (match === 'mismatch' || match === 'partial') anyMismatch = true;
    }
    status = anyMismatch ? 'discrepancy' : 'completed';
  } else if (input.pending || input.hasInput) {
    status = 'in-progress';
    comment =
      input.pendingComment ??
      'Verification is currently underway with the respective source. The final outcome is yet to be determined.';
  } else {
    status = 'not-conducted';
    comment = 'This check could not be initiated — the required details were not provided by the candidate.';
  }

  return {
    number,
    title,
    status,
    dataRows,
    twoColRows: [],
    details: data ? input.details.filter((d) => d.value && d.value !== '-') : [],
    documents: data ? input.documents.filter((g) => g.files.length > 0) : [],
    comment,
  };
}

/* ---------- top-level ---------- */

interface CheckGroup {
  number: number;
  name: string;
  status: StatusKey;
  instances: Instance[];
  /** true → render instances numbered (N.1/N.2/N.3); false → single flat body. */
  multi: boolean;
}

function buildGroups(s: ReportSubject): CheckGroup[] {
  const aadhaar = errOf(s.aadhaarResult) || manualOf(s.aadhaarResult) ? null : (s.aadhaarResult as Dict | null);
  const pan = errOf(s.panResult) || manualOf(s.panResult) ? null : (s.panResult as Dict | null);
  const dl = errOf(s.dlResult) || manualOf(s.dlResult) ? null : (s.dlResult as Dict | null);
  const voter = errOf(s.voterResult) || manualOf(s.voterResult) ? null : (s.voterResult as Dict | null);
  const passport = errOf(s.passportResult) || manualOf(s.passportResult) ? null : (s.passportResult as Dict | null);
  const employment = errOf(s.employmentResult) || manualOf(s.employmentResult) ? null : (s.employmentResult as Dict | null);
  const crime = (errOf(s.crimeResult) || manualOf(s.crimeResult) ? null : s.crimeResult) as { data?: Dict } | null;
  const credit = (errOf(s.creditResult) || manualOf(s.creditResult) ? null : s.creditResult) as Dict | null;

  const dlData = unwrap(dl);
  const voterData = unwrap(voter);
  const passportData = unwrap(passport);
  const employmentData = unwrap(employment);
  const creditData = unwrap(credit);

  // ── Identity Verification (Aadhaar, PAN, Driving Licence, Voter, Passport) ──
  const idInstances: Instance[] = [
    idInstance(1, 'Aadhaar Card', {
      result: s.aadhaarResult,
      hasInput: Boolean(s.digilockerClientId || s.aadhaarNumber),
      pending: Boolean(s.digilockerClientId) && !aadhaar,
      pendingComment:
        'A secure verification link has been shared with the candidate. This check will be completed once the candidate provides their consent and verifies their Aadhaar through DigiLocker. The report will update automatically upon completion.',
      rows: [
        { label: 'Aadhaar Number', provided: last4(s.aadhaarNumber) ? `XXXX XXXX ${last4(s.aadhaarNumber)}` : '', found: (aadhaar?.uidMasked as string) || '', kind: 'eq' },
        { label: 'Name', provided: s.name || '', found: (aadhaar?.name as string) || '', kind: 'name' },
        { label: 'Date of Birth', provided: s.dob || '', found: (aadhaar?.dob as string) || '', kind: 'dob' },
      ],
      details: [
        { label: 'Gender', value: or(genderLabel(aadhaar?.gender as string)) },
        {
          label: 'Address',
          value: or(
            aadhaar && typeof aadhaar.address === 'object'
              ? Object.values(aadhaar.address as Dict).filter((v) => typeof v === 'string' && v).join(', ')
              : (aadhaar?.address as string),
          ),
        },
      ],
      documents: [
        {
          label: 'Aadhaar Card',
          files: [
            ...(s.aadhaarFront ? [{ name: 'Front side', url: s.aadhaarFront }] : []),
            ...(s.aadhaarBack ? [{ name: 'Back side', url: s.aadhaarBack }] : []),
          ],
        },
      ],
    }),
    idInstance(2, 'PAN Card', {
      result: s.panResult,
      hasInput: Boolean(s.panNumber),
      pending: Boolean(s.panNumber) && !pan,
      rows: [
        { label: 'PAN Number', provided: s.panNumber || '', found: (pan?.pan_number as string) || '', kind: 'eq' },
        { label: 'Name', provided: s.name || '', found: (pan?.full_name as string) || '', kind: 'name' },
        { label: 'Date of Birth', provided: s.dob || '', found: (pan?.dob as string) || '', kind: 'dob' },
      ],
      details: [
        { label: 'Gender', value: or(genderLabel(pan?.gender as string)) },
        { label: 'Email', value: or(pan?.email as string) },
        { label: 'Phone', value: or(pan?.phone_number as string) },
      ],
      documents: [
        {
          label: 'PAN Card',
          files: [
            ...(s.panFront ? [{ name: 'Front side', url: s.panFront }] : []),
            ...(s.panBack ? [{ name: 'Back side', url: s.panBack }] : []),
          ],
        },
      ],
    }),
    idInstance(3, 'Driving Licence', {
      result: s.dlResult,
      hasInput: Boolean(s.drivingLicense),
      pending: false,
      rows: [
        { label: 'Licence Number', provided: s.drivingLicense || '', found: pick(dlData, ['license_number', 'licence_number', 'dl_number', 'driving_license_number']), kind: 'eq' },
        { label: 'Name', provided: s.name || '', found: pick(dlData, ['name', 'full_name']), kind: 'name' },
        { label: 'Date of Birth', provided: s.dob || '', found: pick(dlData, ['dob', 'date_of_birth']), kind: 'dob' },
      ],
      details: [
        { label: 'State', value: or(pick(dlData, ['state'])) },
        { label: 'Date of Issue', value: or(pick(dlData, ['date_of_issue', 'doi'])) },
        { label: 'Date of Expiry', value: or(pick(dlData, ['date_of_expiry', 'doe'])) },
        { label: 'Vehicle Classes', value: or(pick(dlData, ['vehicle_classes', 'cov'])) },
      ],
      documents: [],
    }),
    idInstance(4, 'Voter ID', {
      result: s.voterResult,
      hasInput: Boolean(s.voterId),
      pending: false,
      rows: [
        { label: 'Voter ID (EPIC)', provided: s.voterId || '', found: pick(voterData, ['epic_no', 'epic_number', 'voter_id']), kind: 'eq' },
        { label: 'Name', provided: s.name || '', found: pick(voterData, ['name', 'full_name']), kind: 'name' },
      ],
      details: [
        { label: 'State', value: or(pick(voterData, ['state'])) },
        { label: 'Assembly Constituency', value: or(pick(voterData, ['assembly_constituency', 'ac_name'])) },
        { label: "Relation's Name", value: or(pick(voterData, ['relation_name', 'rln_name'])) },
      ],
      documents: [],
    }),
    // Passport is switched off for now — omit the instance entirely.
    ...(PASSPORT_CHECK_ENABLED
      ? [
        idInstance(5, 'Passport', {
          result: s.passportResult,
          hasInput: Boolean(s.passportFileNo),
          pending: false,
          rows: [
            { label: 'File Number', provided: s.passportFileNo || '', found: pick(passportData, ['file_number', 'passport_file_number', 'file_no', 'passport_no']), kind: 'eq' },
            { label: 'Name', provided: s.name || '', found: pick(passportData, ['name', 'full_name']), kind: 'name' },
            { label: 'Date of Birth', provided: s.dob || '', found: pick(passportData, ['dob', 'date_of_birth']), kind: 'dob' },
          ],
          details: [
            { label: 'Application Date', value: or(pick(passportData, ['application_date'])) },
            { label: 'Status', value: or(pick(passportData, ['status'])) },
          ],
          documents: [],
        }),
        ]
      : []),
  ];

  // ── Employment History ──
  const empErr = errOf(s.employmentResult);
  const empManual = manualOf(s.employmentResult);
  const empInstance: Instance = employment
    ? {
        number: 1,
        title: 'Employment History',
        status: 'completed',
        dataRows: [
          {
            label: 'UAN',
            provided: or(s.uan),
            found: or(pick(employmentData, ['uan', 'uan_number'])),
            match: rowMatchState(
              or(s.uan),
              or(pick(employmentData, ['uan', 'uan_number'])),
              'eq',
            ),
          },
          {
            label: 'Name',
            provided: or(s.name),
            found: or(pick(employmentData, ['name', 'full_name', 'member_name'])),
            match: rowMatchState(
              or(s.name),
              or(pick(employmentData, ['name', 'full_name', 'member_name'])),
              'name',
            ),
          },
        ],
        twoColRows: [],
        details: [
          { label: 'Establishment', value: or(pick(employmentData, ['establishment_name', 'company'])) },
          { label: 'Date of Joining', value: or(pick(employmentData, ['date_of_joining', 'doj'])) },
          { label: 'Latest Contribution', value: or(pick(employmentData, ['last_month'])) },
        ].filter((d) => d.value !== '-'),
        documents: [],
        comment: null,
      }
    : {
        number: 1,
        title: 'Employment History',
        status: empErr && isUnresolvedFailure(s.employmentResult)
          ? 'in-progress'
          : empErr
          ? 'insufficiency'
          : empManual
            ? 'manual'
            : s.uan
              ? 'in-progress'
              : 'not-conducted',
        dataRows: [],
        twoColRows: [],
        details: [],
        documents: [],
        comment:
          (empErr ? unableToVerifyComment(empErr) : null) ||
          (empManual ? manualComment(empManual) : null) ||
          (s.uan
            ? 'Verification is currently underway with the respective source.'
            : 'This check could not be initiated — a UAN was not provided by the candidate.'),
      };
  // Recompute discrepancy for employment when we have data.
  if (employment) {
    const mismatch = empInstance.dataRows.some(
      (r) => r.match === 'mismatch' || r.match === 'partial',
    );
    empInstance.status = mismatch ? 'discrepancy' : 'completed';
  }

  // ── Criminal Records ──
  const crimeErr = errOf(s.crimeResult);
  const report = (crime?.data as Dict) ?? {};
  const ra = (report.risk_assessment as Dict) ?? {};
  const cases = Array.isArray(report.cases) ? (report.cases as Dict[]) : [];
  const crimeHasInput = Boolean(s.name && s.dob && s.permanentAddress);
  const crimePending = Boolean(s.crimeRequestId) && !crime;
  const crimeInstance: Instance = { number: 1, title: 'Criminal Records', status: 'completed', dataRows: [], twoColRows: [], details: [], documents: [], comment: null };
  const crimeManual = manualOf(s.crimeResult);
  const crimeReportUrl = vendorReportUrl(s.crimeResult);
  if (crimeErr && isUnresolvedFailure(s.crimeResult)) {
    crimeInstance.status = 'in-progress';
    crimeInstance.comment =
      'Verification is currently underway with the respective source.';
  } else if (crimeErr) {
    crimeInstance.status = 'insufficiency';
    crimeInstance.comment = unableToVerifyComment(crimeErr);
  } else if (crimeManual) {
    crimeInstance.status = 'manual';
    crimeInstance.comment = manualComment(crimeManual);
  } else if (crime) {
    const count = typeof ra.number_of_cases === 'number' ? (ra.number_of_cases as number) : cases.length;
    const riskType = (ra.risk_type as string) || (count > 0 ? 'Records Found' : 'No Risk');
    if (crimeReportUrl) {
      crimeInstance.documents = [
        {
          label: 'Court Record Report',
          files: [{ name: 'Full court record report (PDF)', url: crimeReportUrl }],
        },
      ];
    }
    crimeInstance.twoColRows = [
      { label: 'Candidate Name', value: or(s.name) },
      { label: 'Total Records Identified', value: or(count) },
      { label: 'Risk Category', value: or(riskType) },
      { label: 'Risk Summary', value: or(ra.risk_summary as string) },
    ];
    crimeInstance.status = /high|serious|critical|records found/i.test(riskType) && count > 0 ? 'discrepancy' : 'completed';
    cases.forEach((c, i) => {
      const loc = [c.district, c.state].filter(Boolean).join(', ');
      const bits = [
        c.caseType || c.caseTypeName ? `Type: ${c.caseType || c.caseTypeName}` : '',
        c.courtName ? `Court: ${c.courtName}` : '',
        loc ? `Location: ${loc}` : '',
        c.caseStatus ? `Status: ${c.caseStatus}` : '',
      ].filter(Boolean).join(' · ');
      crimeInstance.details.push({ label: `Case ${c.slNo ?? i + 1}`, value: or(bits) });
    });
    const crimeUrl = pick(report, ['download_link', 'download_url', 'report_url', 'pdf']);
    if (crimeUrl) crimeInstance.documents.push({ label: 'Criminal Report', files: [{ name: 'View / download report', url: crimeUrl }] });
    cases.forEach((c, i) => {
      const files: Array<{ name: string; url: string }> = [];
      const add = (name: string, v: unknown) => {
        const u = typeof v === 'string' ? v.trim() : '';
        if (u && u.toUpperCase() !== 'NA') files.push({ name, url: u });
      };
      add('Case details', c.caseDetailsLink);
      add('Judgement', c.judgementLink);
      add('FIR copy', c.firLink);
      if (files.length) crimeInstance.documents.push({ label: `Case ${c.slNo ?? i + 1} documents`, files });
    });
  } else if (crimePending || crimeHasInput) {
    crimeInstance.status = 'in-progress';
    crimeInstance.comment = 'Court and FIR records are currently being aggregated across the searched jurisdictions.';
  } else {
    crimeInstance.status = 'not-conducted';
    crimeInstance.comment = 'This check could not be initiated — name, date of birth and permanent address are required.';
  }

  // ── Credit History ──
  const creditErr = errOf(s.creditResult);
  // The bureau needs PAN + DOB + father's name + a verified-Aadhaar address.
  // Report each blocker precisely instead of a generic "in progress".
  const creditAadhaarAddress = aadhaarAddressComplete(s.aadhaarResult);
  // Same resolution order as the engine (Aadhaar → PAN → form), so the report
  // never claims a father's name is missing when Aadhaar already supplied it.
  const creditFatherName = resolveFatherName({
    aadhaarResult: s.aadhaarResult,
    panResult: s.panResult,
    fatherName: s.fatherName,
  });
  const creditSubmitted = Boolean(s.creditRequestId);
  const creditPhone = String(s.phone ?? '').replace(/\D/g, '').length >= 10;
  const creditHasInput = Boolean(
    s.panNumber && s.dob && creditFatherName && creditPhone && creditAadhaarAddress,
  );
  const creditInstance: Instance = { number: 1, title: 'Credit History', status: 'completed', dataRows: [], twoColRows: [], details: [], documents: [], comment: null };
  const creditManual = manualOf(s.creditResult);
  const creditReportUrl = vendorReportUrl(s.creditResult);
  if (creditErr && isUnresolvedFailure(s.creditResult)) {
    creditInstance.status = 'in-progress';
    creditInstance.comment =
      'Verification is currently underway with the respective source.';
  } else if (creditErr) {
    creditInstance.status = 'insufficiency';
    creditInstance.comment = unableToVerifyComment(creditErr);
  } else if (creditManual) {
    creditInstance.status = 'manual';
    creditInstance.comment = manualComment(creditManual);
  } else if (credit) {
    if (creditReportUrl) {
      creditInstance.documents = [
        {
          label: 'Credit Bureau Report',
          files: [{ name: 'Full credit report (PDF)', url: creditReportUrl }],
        },
      ];
    }
    creditInstance.twoColRows = [
      { label: 'Credit Score', value: or(pick(creditData, ['credit_score', 'score'])) },
      { label: 'Bureau', value: or(pick(creditData, ['bureau'])) },
      { label: 'Score Band', value: or(pick(creditData, ['score_band', 'band'])) },
      { label: 'Total Accounts', value: or(pick(creditData, ['total_accounts'])) },
      { label: 'Active Accounts', value: or(pick(creditData, ['active_accounts'])) },
      { label: 'Overdue Amount', value: or(pick(creditData, ['overdue_amount'])) },
    ];
    const creditUrl = pick(creditData, ['pdf', 'pdf_url', 'download_url', 'download_link', 'report_url', 'signed_url', 'url', 'link']);
    if (creditUrl) creditInstance.documents.push({ label: 'Credit Report', files: [{ name: 'View / download report', url: creditUrl }] });
    creditInstance.status = 'completed';
    const anyCreditField = creditInstance.twoColRows.some(
      (r) => r.value && r.value !== '-',
    );
    if (!anyCreditField && creditReportUrl) {
      creditInstance.twoColRows = [];
      creditInstance.comment =
        'The credit bureau returned its report as a document rather than ' +
        'structured fields. The full report is attached below.';
    }
  } else if (creditSubmitted) {
    creditInstance.status = 'in-progress';
    creditInstance.comment =
      'Submitted to the credit bureau — the result typically arrives within 24 hours.';
  } else if (creditHasInput) {
    creditInstance.status = 'in-progress';
    creditInstance.comment = 'The credit bureau result is currently being retrieved.';
  } else if (!s.panNumber || !s.dob) {
    creditInstance.status = 'not-conducted';
    creditInstance.comment =
      'This check could not be initiated — the credit bureau requires a PAN and date of birth.';
  } else if (!creditPhone) {
    creditInstance.status = 'in-progress';
    creditInstance.comment =
      'Waiting on a contact number for the candidate, which the credit bureau requires. The check starts once it is added.';
  } else if (!creditFatherName) {
    // Kept 'in-progress' rather than 'not-conducted' on purpose: the report
    // hides not-conducted checks entirely, and this one is a fixable gap the
    // client should see — adding the father's name starts the check.
    creditInstance.status = 'in-progress';
    creditInstance.comment =
      'Waiting on the candidate’s father’s name, which the credit bureau requires. The check starts once it is added.';
  } else {
    creditInstance.status = 'in-progress';
    creditInstance.comment =
      'Waiting on the candidate’s Aadhaar. The credit bureau requires the full verified address (street, city, state and pincode), which is taken from Aadhaar — the check starts automatically once DigiLocker is complete.';
  }

  return [
    { number: 1, name: 'Identity Verification', status: worstStatus(idInstances.map((i) => i.status)), instances: idInstances, multi: true },
    { number: 2, name: 'Employment History Verification', status: empInstance.status, instances: [empInstance], multi: false },
    { number: 3, name: 'Criminal Records Verification', status: crimeInstance.status, instances: [crimeInstance], multi: false },
    // Credit is switched off for now — omit the section entirely rather than
    // printing an empty "Not provided" block in the client's report.
    ...(CREDIT_CHECK_ENABLED
      ? [{ number: 4, name: 'Credit History Verification', status: creditInstance.status, instances: [creditInstance], multi: false }]
      : []),
  ];
}

/* ---------- fragment renderers ---------- */

function badge(k: StatusKey): string {
  return `<span class="status-badge status-${STATUS_CLASS[k]}">${STATUS_LABEL[k]}</span>`;
}

const MATCH_LABEL: Record<MatchState, string> = {
  match: 'Match',
  partial: 'Partial',
  mismatch: 'Mismatch',
  na: '—',
};
function matchTag(m: MatchState): string {
  if (m === 'na') return '<span class="match-na">—</span>';
  return `<span class="match-tag match-${m}">${MATCH_LABEL[m]}</span>`;
}
function badgeSmall(k: StatusKey): string {
  return `<span class="status-badge status-${STATUS_CLASS[k]}" style="font-size:8px;padding:1px 6px;line-height:14px;">${STATUS_LABEL[k]}</span>`;
}

function comparisonSection(header: string, inst: Instance): string {
  if (inst.dataRows.length) {
    return `<div class="section">
      <div class="section-header">${header}</div>
      <table class="section-table four-col">
        <thead><tr><th>Check</th><th>Data Provided</th><th>Data Found</th><th>Match</th></tr></thead>
        <tbody>${inst.dataRows.map((r) => `<tr><td>${escapeHtml(r.label)}</td><td>${escapeHtml(r.provided)}</td><td>${escapeHtml(r.found)}</td><td>${matchTag(r.match)}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  }
  if (inst.twoColRows.length) {
    return `<div class="section">
      <div class="section-header">${header}</div>
      <table class="section-table two-col-wide">
        <thead><tr><th>Check</th><th>Result</th></tr></thead>
        <tbody>${inst.twoColRows.map((r) => `<tr><td>${escapeHtml(r.label)}</td><td>${escapeHtml(r.value)}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  }
  return '';
}
function detailsSection(header: string, inst: Instance): string {
  if (!inst.details.length) return '';
  return `<div class="section">
    <div class="section-header">${header}</div>
    <table class="section-table two-col"><tbody>${inst.details.map((d) => `<tr><td>${escapeHtml(d.label)}</td><td>${escapeHtml(d.value)}</td></tr>`).join('')}</tbody></table>
  </div>`;
}
function documentsSection(header: string, inst: Instance): string {
  if (!inst.documents.length) return '';
  return `<div class="section">
    <div class="section-header">${header}</div>
    <table class="section-table two-col"><tbody>${inst.documents
      .map(
        (g) => `<tr><td>${escapeHtml(g.label)}</td><td>${
          g.files.length
            ? g.files
                .map(
                  (f, i) =>
                    `${i ? '<span class="doc-sep">, </span>' : ''}${
                      f.url
                        ? `<a class="doc-link" href="${escapeHtml(f.url)}" target="_blank" rel="noopener">${escapeHtml(f.name)}</a>`
                        : `<span class="doc-name">${escapeHtml(f.name)}</span>`
                    }`,
                )
                .join('')
            : '-'
        }</td></tr>`,
      )
      .join('')}</tbody></table>
  </div>`;
}
function commentBox(text: string): string {
  return `<div class="recriauth-comment">
    <div class="recriauth-comment-title">Assurio Comments</div>
    <ul class="recriauth-comment-list"><li class="recriauth-comment-item">${escapeHtml(text)}</li></ul>
  </div>`;
}

function renderGroup(g: CheckGroup): string {
  const titleRow = `<div class="title-row keep"><span class="check-title">${escapeHtml(g.name)}</span>${badge(g.status)}</div>`;

  if (g.multi) {
    const body = g.instances
      .map((inst) => {
        const head = `<div class="instance-title keep">${inst.number}) ${escapeHtml(inst.title)} ${badgeSmall(inst.status)}</div>`;
        const sections =
          comparisonSection(`${inst.number}.1) Data Comparison`, inst) +
          detailsSection(`${inst.number}.2) Details`, inst) +
          documentsSection(`${inst.number}.3) Documents`, inst);
        const body = sections || (inst.comment ? commentBox(inst.comment) : '');
        return `<div class="instance">${head}${body}</div>`;
      })
      .join('');
    return `<div class="check">${titleRow}${body}</div>`;
  }

  const inst = g.instances[0];
  const body =
    comparisonSection('Data Comparison', inst) +
    detailsSection('Details', inst) +
    documentsSection('Documents', inst) +
    (inst.comment ? commentBox(inst.comment) : '');
  return `<div class="check">${titleRow}${body}</div>`;
}

/** Chromium footer template — the angled navy page-number banner, repeated on
 *  every physical page with a real page number. Fed to PdfService. */
export function renderReportFooter(s: ReportSubject): string {
  const meta = `${escapeHtml(s.name)} · Case ${escapeHtml(s.caseRef || '-')} · Strictly confidential — Powered by Assurio.`;
  return `<div style="width:100%;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:8px;color:${BRAND.textBody};padding:0 12mm;box-sizing:border-box;display:flex;align-items:center;">
    <span style="background:${BRAND.primaryDark};color:#ffffff;font-size:9px;font-weight:700;padding:5px 22px 5px 14px;-webkit-print-color-adjust:exact;print-color-adjust:exact;clip-path:polygon(0 0,100% 0,calc(100% - 12px) 100%,0 100%);border-bottom-left-radius:6px;"><span class="pageNumber"></span></span>
    <span style="flex:1;padding-left:14px;">${meta}</span>
    <span style="color:${BRAND.primary};">assurio.com</span>
  </div>`;
}

export function renderSubjectReportHtml(s: ReportSubject): string {
  // Hide "Not provided" (not-conducted) checks entirely — drop such instances,
  // then drop any group left empty, and renumber so there are no gaps.
  const groups = buildGroups(s)
    .map((g) => {
      const instances = g.instances
        .filter((i) => i.status !== 'not-conducted')
        .map((inst, idx) => ({ ...inst, number: idx + 1 }));
      return {
        ...g,
        instances,
        status: instances.length
          ? worstStatus(instances.map((i) => i.status))
          : g.status,
      };
    })
    .filter((g) => g.instances.length > 0)
    .map((g, idx) => ({ ...g, number: idx + 1 }));
  // Until the candidate consents, nothing has been sent to any source — so the
  // default "underway with the source" copy would be untrue. Rewrite it (and
  // the headline status) to reflect what is actually happening.
  const consent = s.consentStatus ?? 'GRANTED';
  const consentPending = consent === 'PENDING';
  const consentClosed = consent === 'DECLINED' || consent === 'EXPIRED';
  if (consentPending || consentClosed) {
    const notStarted = consentPending
      ? 'Awaiting the candidate’s consent. This check has not been initiated yet — it starts as soon as they accept the consent request.'
      : consent === 'DECLINED'
        ? 'The candidate declined consent, so this check was never initiated. The verification is closed and the charge refunded.'
        : 'The consent request expired unanswered, so this check was never initiated. The verification is closed and the charge refunded.';
    const gatedStatus: StatusKey = consentPending
      ? 'awaiting-consent'
      : 'not-started';
    for (const g of groups) {
      for (const inst of g.instances) {
        if (inst.status === 'in-progress') {
          inst.status = gatedStatus;
          inst.comment = notStarted;
        }
      }
      // Group badge must follow the instances we just re-labelled.
      g.status = worstStatus(g.instances.map((i) => i.status));
    }
  }

  const allStatuses = groups.flatMap((g) => g.instances.map((i) => i.status));
  const reportStatus = worstStatus(allStatuses);
  const reportStatusBadge = consentPending
    ? '<span class="status-badge status-pending">Awaiting consent</span>'
    : consentClosed
      ? `<span class="status-badge status-closed">${consent === 'DECLINED' ? 'Consent declined' : 'Consent expired'}</span>`
      : badge(reportStatus);
  // "Date Completed" = when the verification finished, i.e. every check that
  // was actually conducted reached a terminal state. A manual override and a
  // failed lookup are both terminal outcomes, not open work — leaving them out
  // left the date blank forever on any report containing one. Groups that were
  // never conducted (inputs not provided) are ignored rather than blocking.
  const TERMINAL_STATUSES: StatusKey[] = [
    'completed',
    'discrepancy',
    'manual',
    'insufficiency',
  ];
  const conducted = groups.filter((g) => g.status !== 'not-conducted');
  const allDone =
    conducted.length > 0 &&
    conducted.every((g) => TERMINAL_STATUSES.includes(g.status));
  const companyInitial = (s.clientName || 'A').charAt(0).toUpperCase();

  const summaryRows = groups
    .map((g) => {
      const subRows = g.multi
        ? g.instances
            .map(
              (inst, i) =>
                `<tr class="sub"><td></td><td class="name-cell sub-label"><span class="sub-letter">${String.fromCharCode(97 + i)})</span> ${escapeHtml(inst.title)}</td><td>${badgeSmall(inst.status)}</td></tr>`,
            )
            .join('')
        : '';
      return `<tr>
        <td class="no-cell">${g.number}</td>
        <td class="name-cell">${escapeHtml(g.name)}</td>
        <td>${badge(g.status)}</td>
      </tr>${subRows}`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Verification Report — ${escapeHtml(s.name)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { font-family: Manrope, Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.5; color: ${BRAND.textHeading}; background: #ffffff; }
.doc { width: 600px; margin: 0 auto; }
.break { break-before: page; }
.section, .instance, .title-row, .instance-title { page-break-inside: avoid; break-inside: avoid; }
.keep { break-after: avoid; }
.title-row { display: flex; align-items: center; gap: 12px; margin: 0 0 18px; }
.check { margin-bottom: 26px; }
.check + .check { margin-top: 8px; }
.check-title { font-size: 22px; font-weight: 600; color: ${BRAND.textHeading}; }
.status-badge { display: inline-block; padding: 2px 8px; border-radius: 900px; font-size: 10px; font-weight: 500; line-height: 16px; }
.status-completed { background: ${BRAND.successTint}; color: ${BRAND.success}; }
.status-closed { background: ${BRAND.border}; color: ${BRAND.textBody}; }
.status-discrepancy { background: ${BRAND.warningTint}; color: ${BRAND.warning}; }
.status-manual { background: ${BRAND.warningTint}; color: ${BRAND.warning}; }
.status-insufficiency { background: ${BRAND.warningTint}; color: ${BRAND.warning}; }
.status-not-conducted { background: ${BRAND.failureTint}; color: ${BRAND.failure}; }
.status-pending { background: ${BRAND.primaryTint}; color: ${BRAND.primary}; }
.instance-title { font-size: 12px; font-weight: 600; color: ${BRAND.textBody}; margin: 16px 0 8px; }
.instance-title .status-badge { margin-left: 6px; vertical-align: middle; }
.recriauth-comment { background: ${BRAND.primaryBg}; border-radius: 4px; padding: 8px; margin-bottom: 16px; }
.recriauth-comment-title { font-size: 10px; font-weight: 600; color: ${BRAND.textBody}; margin-bottom: 10px; }
.recriauth-comment-list { list-style: none; padding: 0; margin: 0; }
.recriauth-comment-item { position: relative; padding-left: 14px; font-size: 10px; line-height: 1.7; color: ${BRAND.textBody}; }
.recriauth-comment-item::before { content: ''; position: absolute; left: 0; top: 7px; width: 4px; height: 4px; border-radius: 50%; background: ${BRAND.primary}; }
.section { margin-bottom: 16px; border-radius: 4px; overflow: hidden; }
.section-header { background: ${BRAND.primaryDeep}; color: #ffffff; font-size: 12px; line-height: 1.8; font-weight: 600; padding: 4px 8px; border-radius: 4px 4px 0 0; }
.section-table { width: 100%; border-collapse: collapse; border: 1px solid ${BRAND.textDisabled}; border-top: none; border-radius: 0 0 4px 4px; }
.section-table th, .section-table td { padding: 4px 8px; font-size: 10px; font-weight: 600; line-height: 1.5; text-align: left; vertical-align: top; color: ${BRAND.textBody}; }
.section-table th + th, .section-table td + td { border-left: 1px solid ${BRAND.textDisabled}; }
.section-table tbody tr + tr td { border-top: 1px solid ${BRAND.textDisabled}; }
.section-table thead tr { background: ${BRAND.primaryBg}; }
.section-table td { color: ${BRAND.textBody}; font-weight: 500; }
.section-table.three-col th:first-child, .section-table.three-col td:first-child { width: 26%; color: ${BRAND.textHeading}; font-weight: 400; }
.section-table.three-col th:nth-child(2), .section-table.three-col td:nth-child(2), .section-table.three-col th:nth-child(3), .section-table.three-col td:nth-child(3) { width: 37%; }
.section-table.four-col th:first-child, .section-table.four-col td:first-child { width: 24%; color: ${BRAND.textHeading}; font-weight: 400; }
.section-table.four-col th:nth-child(2), .section-table.four-col td:nth-child(2), .section-table.four-col th:nth-child(3), .section-table.four-col td:nth-child(3) { width: 29%; }
.section-table.four-col th:nth-child(4), .section-table.four-col td:nth-child(4) { width: 18%; vertical-align: middle; }
.match-tag { display: inline-block; padding: 1px 8px; border-radius: 900px; font-size: 10px; font-weight: 500; line-height: 16px; }
.match-match { background: ${BRAND.successTint}; color: ${BRAND.success}; }
.match-mismatch { background: ${BRAND.failureTint}; color: ${BRAND.failure}; }
.match-partial { background: ${BRAND.warningTint}; color: ${BRAND.warning}; }
.match-na { color: ${BRAND.textDisabled}; }
.section-table tr:has(.status-badge) td { vertical-align: middle; }
.section-table.two-col td:first-child { width: 30%; color: ${BRAND.textBody}; font-weight: 600; }
.section-table.two-col-wide th:first-child, .section-table.two-col-wide td:first-child { width: 45%; color: ${BRAND.textHeading}; font-weight: 400; }
.section-table.two-col-wide th:nth-child(2), .section-table.two-col-wide td:nth-child(2) { width: 55%; }
.doc-name { color: ${BRAND.textMuted}; font-weight: 500; font-size: 10px; }
.doc-link { color: ${BRAND.primary}; font-weight: 500; text-decoration: none; font-size: 10px; }
.doc-sep { color: ${BRAND.textBody}; }
.top-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
.company-info { display: flex; align-items: center; gap: 12px; }
.company-logo-placeholder { width: 40px; height: 40px; border-radius: 50%; background: ${BRAND.primaryDeep}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; }
.company-name { font-size: 12px; font-weight: 700; color: ${BRAND.textHeading}; }
.assurio-logo { display: flex; align-items: center; gap: 8px; }
.assurio-logo img { height: 30px; width: 30px; object-fit: contain; }
.assurio-logo .word { font-size: 16px; font-weight: 700; color: ${BRAND.textHeading}; letter-spacing: -0.01em; }
.report-title { font-size: 20px; font-weight: 600; color: ${BRAND.textHeading}; margin-bottom: 4px; }
.report-subtitle { font-size: 12px; font-weight: 600; line-height: 18px; color: ${BRAND.textBody}; margin-bottom: 20px; }
.confidential-box { background: ${BRAND.successTint}; border-radius: 4px; padding: 8px; font-size: 8px; font-weight: 400; line-height: 1.6; color: #000000; margin-bottom: 20px; }
.confidential-box .powered { font-weight: 600; margin-top: 4px; display: block; }
.checks-table td { font-weight: 500; vertical-align: middle; }
.checks-table td.no-cell { width: 8%; color: ${BRAND.textMuted}; }
.checks-table td.name-cell { color: ${BRAND.primaryDark}; }
.checks-table tr.sub td { border-top: 1px solid ${BRAND.borderSoft}; }
.checks-table .sub-label { color: ${BRAND.primary}; padding-left: 18px; }
.checks-table .sub-label .sub-letter { color: ${BRAND.textBody}; }
.legend-table td:first-child, .legend-table th:first-child { width: 180px; vertical-align: middle; }
.legend-table td { color: ${BRAND.textBody}; }
@media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
</style></head>
<body><div class="doc">

  <!-- Cover -->
  <div class="top-bar">
    <div class="company-info">
      <div class="company-logo-placeholder">${escapeHtml(companyInitial)}</div>
      <span class="company-name">${escapeHtml(s.clientName || '—')}</span>
    </div>
    <div class="assurio-logo"><img src="${ASSURIO_LOGO_DATA_URI}" alt="Assurio"/><span class="word">Assurio</span></div>
  </div>
  <div class="report-title">Background Verification Report</div>
  <div class="report-subtitle">${escapeHtml(s.name)} (${escapeHtml(s.caseRef || '—')})</div>
  <div class="confidential-box">
    This report is strictly confidential and intended solely for the designated recipient. Any use beyond its intended purpose requires prior written permission from Assurio. Unauthorised use, disclosure, or distribution is strictly prohibited.
    <span class="powered">- Powered by Assurio, consent-first background checks.</span>
  </div>
  <div class="section">
    <div class="section-header">Candidate Details</div>
    <table class="section-table two-col"><tbody>
      <tr><td>Case ID</td><td>${escapeHtml(s.caseRef || '-')}</td></tr>
      <tr><td>Candidate Name</td><td>${escapeHtml(s.name)}</td></tr>
      <tr><td>Role / Package</td><td>${escapeHtml(s.role || 'Background Verification')}</td></tr>
      <tr><td>Report Status</td><td>${reportStatusBadge}</td></tr>
      <tr><td>Date Initiated</td><td>${fmtDate(s.createdAt)}</td></tr>
      <tr><td>Date Completed</td><td>${allDone ? fmtDate(s.updatedAt) : '-'}</td></tr>
      <tr><td>Contact No</td><td>${escapeHtml(s.phone || '-')}</td></tr>
      <tr><td>Email</td><td>${escapeHtml(s.email || '-')}</td></tr>
      <tr><td>Client</td><td>${escapeHtml(s.clientName || '-')}</td></tr>
    </tbody></table>
  </div>

  <!-- Verification Summary -->
  <div class="break">
    <div class="section">
      <div class="section-header">Verification Summary</div>
      <table class="section-table checks-table">
        <thead><tr><th>No.</th><th>Verification Check</th><th>Status</th></tr></thead>
        <tbody>${summaryRows}</tbody>
      </table>
    </div>
    <div class="section">
      <div class="section-header">What each status Represents?</div>
      <table class="section-table legend-table">
        <thead><tr><th>Status</th><th>Definition</th></tr></thead>
        <tbody>
          <tr><td><span class="status-badge status-completed">Completed</span></td><td>The verification was conducted successfully and the details provided by the candidate match the records from the source.</td></tr>
          <tr><td><span class="status-badge status-insufficiency">Unable to verify</span></td><td>This check could not be completed — the verification source was unavailable, or it returned no record matching the details provided. It is not a finding against the candidate.</td></tr>
          <tr><td><span class="status-badge status-manual">Verified manually</span></td><td>The verification source could not return a result, so an authorised administrator confirmed this check outside the automated flow. The source did not confirm it.</td></tr>
          <tr><td><span class="status-badge status-pending">In progress</span></td><td>The verification is currently underway with the source and the final outcome is yet to be determined.</td></tr>
          ${
            consentPending
              ? '<tr><td><span class="status-badge status-pending">Awaiting consent</span></td><td>The candidate has not accepted the consent request yet, so this check has not been initiated. It starts the moment they accept.</td></tr>'
              : ''
          }
          ${
            consentClosed
              ? '<tr><td><span class="status-badge status-closed">Not started</span></td><td>Consent was declined or the request expired, so this check was never initiated and the charge was refunded.</td></tr>'
              : ''
          }
        </tbody>
      </table>
    </div>
  </div>

  <!-- Checks (flow continuously) -->
  <div class="break">
    ${groups.map(renderGroup).join('')}
  </div>

</div></body></html>`;
}
