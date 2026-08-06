/**
 * Server-side renderer for a candidate's Background Verification Report — a 1:1
 * visual replica of Recriauth's report (Recriauth/server/src/modules/
 * candidate-report). Same Manrope type, navy #0E3179 section headers, 3-column
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
  digilockerClientId?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

type Dict = Record<string, unknown>;

type StatusKey =
  | 'completed'
  | 'discrepancy'
  | 'insufficiency'
  | 'in-progress'
  | 'not-conducted';

// Labels + colours match the on-screen candidate report (our own status
// vocabulary), not Recriauth's. Internal keys are kept; a mismatch just reads
// as "Completed" here (the comparison table shows the discrepancy).
const STATUS_LABEL: Record<StatusKey, string> = {
  completed: 'Completed',
  discrepancy: 'Completed',
  insufficiency: 'Failed',
  'in-progress': 'In progress',
  'not-conducted': 'Not provided',
};
const STATUS_CLASS: Record<StatusKey, string> = {
  completed: 'completed', // green
  discrepancy: 'completed', // green
  insufficiency: 'insufficiency', // red
  'in-progress': 'pending', // blue
  'not-conducted': 'closed', // grey
};
/** Roll several instance statuses up to a parent status (worst wins). */
function worstStatus(list: StatusKey[]): StatusKey {
  const order: StatusKey[] = [
    'insufficiency',
    'in-progress',
    'discrepancy',
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
  const data = err ? null : (input.result as Dict | null);
  let status: StatusKey;
  const dataRows: DataRow[] = [];
  let comment: string | null = null;

  if (err) {
    status = 'insufficiency';
    comment = err;
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
  const aadhaar = errOf(s.aadhaarResult) ? null : (s.aadhaarResult as Dict | null);
  const pan = errOf(s.panResult) ? null : (s.panResult as Dict | null);
  const dl = errOf(s.dlResult) ? null : (s.dlResult as Dict | null);
  const voter = errOf(s.voterResult) ? null : (s.voterResult as Dict | null);
  const passport = errOf(s.passportResult) ? null : (s.passportResult as Dict | null);
  const employment = errOf(s.employmentResult) ? null : (s.employmentResult as Dict | null);
  const crime = s.crimeResult as { data?: Dict } | null;
  const credit = s.creditResult as Dict | null;

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
  ];

  // ── Employment History ──
  const empErr = errOf(s.employmentResult);
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
        status: empErr ? 'insufficiency' : s.uan ? 'in-progress' : 'not-conducted',
        dataRows: [],
        twoColRows: [],
        details: [],
        documents: [],
        comment:
          empErr ||
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
  if (crimeErr) {
    crimeInstance.status = 'insufficiency';
    crimeInstance.comment = crimeErr;
  } else if (crime) {
    const count = typeof ra.number_of_cases === 'number' ? (ra.number_of_cases as number) : cases.length;
    const riskType = (ra.risk_type as string) || (count > 0 ? 'Records Found' : 'No Risk');
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
  const creditHasInput = Boolean(s.panNumber && s.dob && s.permanentAddress);
  const creditInstance: Instance = { number: 1, title: 'Credit History', status: 'completed', dataRows: [], twoColRows: [], details: [], documents: [], comment: null };
  if (creditErr) {
    creditInstance.status = 'insufficiency';
    creditInstance.comment = creditErr;
  } else if (credit) {
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
  } else if (creditHasInput) {
    creditInstance.status = 'in-progress';
    creditInstance.comment = 'The credit bureau result is currently being retrieved.';
  } else {
    creditInstance.status = 'not-conducted';
    creditInstance.comment = 'This check could not be initiated — PAN, date of birth and permanent address are required.';
  }

  return [
    { number: 1, name: 'Identity Verification', status: worstStatus(idInstances.map((i) => i.status)), instances: idInstances, multi: true },
    { number: 2, name: 'Employment History Verification', status: empInstance.status, instances: [empInstance], multi: false },
    { number: 3, name: 'Criminal Records Verification', status: crimeInstance.status, instances: [crimeInstance], multi: false },
    { number: 4, name: 'Credit History Verification', status: creditInstance.status, instances: [creditInstance], multi: false },
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
  return `<div style="width:100%;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:8px;color:#374150;padding:0 12mm;box-sizing:border-box;display:flex;align-items:center;">
    <span style="background:#1f3a7a;color:#ffffff;font-size:9px;font-weight:700;padding:5px 22px 5px 14px;-webkit-print-color-adjust:exact;print-color-adjust:exact;clip-path:polygon(0 0,100% 0,calc(100% - 12px) 100%,0 100%);border-bottom-left-radius:6px;"><span class="pageNumber"></span></span>
    <span style="flex:1;padding-left:14px;">${meta}</span>
    <span style="color:#174AB5;">assurio.com</span>
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
  const allStatuses = groups.flatMap((g) => g.instances.map((i) => i.status));
  const reportStatus = worstStatus(allStatuses);
  const allDone = groups.every((g) => g.status === 'completed' || g.status === 'discrepancy');
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
html, body { font-family: Manrope, Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.5; color: #0e1321; background: #ffffff; }
.doc { width: 600px; margin: 0 auto; }
.break { break-before: page; }
.section, .instance, .title-row, .instance-title { page-break-inside: avoid; break-inside: avoid; }
.keep { break-after: avoid; }
.title-row { display: flex; align-items: center; gap: 12px; margin: 0 0 18px; }
.check { margin-bottom: 26px; }
.check + .check { margin-top: 8px; }
.check-title { font-size: 22px; font-weight: 600; color: #0e1321; }
.status-badge { display: inline-block; padding: 2px 8px; border-radius: 900px; font-size: 10px; font-weight: 500; line-height: 16px; }
.status-completed { background: #EAF7EF; color: #2FAB5D; }
.status-closed { background: #EEEFF0; color: #374150; }
.status-discrepancy { background: #FFF9EC; color: #FFB522; }
.status-insufficiency { background: #FCEBEB; color: #E33939; }
.status-not-conducted { background: #FCEBEB; color: #E33939; }
.status-pending { background: #E8EDF8; color: #174AB5; }
.instance-title { font-size: 12px; font-weight: 600; color: #374150; margin: 16px 0 8px; }
.instance-title .status-badge { margin-left: 6px; vertical-align: middle; }
.recriauth-comment { background: #F9FBFF; border-radius: 4px; padding: 8px; margin-bottom: 16px; }
.recriauth-comment-title { font-size: 10px; font-weight: 600; color: #374150; margin-bottom: 10px; }
.recriauth-comment-list { list-style: none; padding: 0; margin: 0; }
.recriauth-comment-item { position: relative; padding-left: 14px; font-size: 10px; line-height: 1.7; color: #374150; }
.recriauth-comment-item::before { content: ''; position: absolute; left: 0; top: 7px; width: 4px; height: 4px; border-radius: 50%; background: #174AB5; }
.section { margin-bottom: 16px; border-radius: 4px; overflow: hidden; }
.section-header { background: #0E3179; color: #ffffff; font-size: 12px; line-height: 1.8; font-weight: 600; padding: 4px 8px; border-radius: 4px 4px 0 0; }
.section-table { width: 100%; border-collapse: collapse; border: 1px solid #b4bac7; border-top: none; border-radius: 0 0 4px 4px; }
.section-table th, .section-table td { padding: 4px 8px; font-size: 10px; font-weight: 600; line-height: 1.5; text-align: left; vertical-align: top; color: #374150; }
.section-table th + th, .section-table td + td { border-left: 1px solid #b4bac7; }
.section-table tbody tr + tr td { border-top: 1px solid #b4bac7; }
.section-table thead tr { background: #F3F7FF; }
.section-table td { color: #4b5563; font-weight: 500; }
.section-table.three-col th:first-child, .section-table.three-col td:first-child { width: 26%; color: #0e1321; font-weight: 400; }
.section-table.three-col th:nth-child(2), .section-table.three-col td:nth-child(2), .section-table.three-col th:nth-child(3), .section-table.three-col td:nth-child(3) { width: 37%; }
.section-table.four-col th:first-child, .section-table.four-col td:first-child { width: 24%; color: #0e1321; font-weight: 400; }
.section-table.four-col th:nth-child(2), .section-table.four-col td:nth-child(2), .section-table.four-col th:nth-child(3), .section-table.four-col td:nth-child(3) { width: 29%; }
.section-table.four-col th:nth-child(4), .section-table.four-col td:nth-child(4) { width: 18%; vertical-align: middle; }
.match-tag { display: inline-block; padding: 1px 8px; border-radius: 900px; font-size: 10px; font-weight: 500; line-height: 16px; }
.match-match { background: #EAF7EF; color: #2FAB5D; }
.match-mismatch { background: #FCEBEB; color: #E33939; }
.match-partial { background: #FFF9EC; color: #FFB522; }
.match-na { color: #9aa1ac; }
.section-table tr:has(.status-badge) td { vertical-align: middle; }
.section-table.two-col td:first-child { width: 30%; color: #374150; font-weight: 600; }
.section-table.two-col-wide th:first-child, .section-table.two-col-wide td:first-child { width: 45%; color: #0e1321; font-weight: 400; }
.section-table.two-col-wide th:nth-child(2), .section-table.two-col-wide td:nth-child(2) { width: 55%; }
.doc-name { color: #6b7280; font-weight: 500; font-size: 10px; }
.doc-link { color: #174AB5; font-weight: 500; text-decoration: none; font-size: 10px; }
.doc-sep { color: #4b5563; }
.top-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
.company-info { display: flex; align-items: center; gap: 12px; }
.company-logo-placeholder { width: 40px; height: 40px; border-radius: 50%; background: #0E3179; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; }
.company-name { font-size: 12px; font-weight: 700; color: #0e1321; }
.assurio-logo { display: flex; align-items: center; gap: 8px; }
.assurio-logo img { height: 30px; width: 30px; object-fit: contain; }
.assurio-logo .word { font-size: 16px; font-weight: 700; color: #0e1321; letter-spacing: -0.01em; }
.report-title { font-size: 20px; font-weight: 600; color: #0e1321; margin-bottom: 4px; }
.report-subtitle { font-size: 12px; font-weight: 600; line-height: 18px; color: #374150; margin-bottom: 20px; }
.confidential-box { background: #E8F8F2; border-radius: 4px; padding: 8px; font-size: 8px; font-weight: 400; line-height: 1.6; color: #000000; margin-bottom: 20px; }
.confidential-box .powered { font-weight: 600; margin-top: 4px; display: block; }
.checks-table td { font-weight: 500; vertical-align: middle; }
.checks-table td.no-cell { width: 8%; color: #6b7280; }
.checks-table td.name-cell { color: #1f3a7a; }
.checks-table tr.sub td { border-top: 1px solid #cdd2dc; }
.checks-table .sub-label { color: #174AB5; padding-left: 18px; }
.checks-table .sub-label .sub-letter { color: #374150; }
.legend-table td:first-child, .legend-table th:first-child { width: 180px; vertical-align: middle; }
.legend-table td { color: #4b5563; }
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
      <tr><td>Report Status</td><td>${badge(reportStatus)}</td></tr>
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
          <tr><td><span class="status-badge status-insufficiency">Failed</span></td><td>The details could not be verified — the information provided was invalid or not found, or the source could not confirm the records.</td></tr>
          <tr><td><span class="status-badge status-pending">In progress</span></td><td>The verification is currently underway with the source and the final outcome is yet to be determined.</td></tr>
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
