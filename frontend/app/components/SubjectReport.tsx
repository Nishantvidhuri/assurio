'use client';

/**
 * Shared verification-report view for a Subject. Rendered on the client-facing
 * candidate page (with a Refresh action) and, read-only, on the admin candidate
 * page — so both sides show the exact same details.
 *
 * Pass `onRefresh` to show the Refresh button; omit it for a view-only render.
 */
import {
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Hourglass,
  MoreVertical,
  RefreshCw,
  Send,
  XCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  adminSendVerificationLink,
  downloadSubjectReport,
  fetchPdfBlobUrl,
  crimeReportPdfUrl,
  recheckSubject,
  type RecheckOverrides,
  manualPassCheck,
  submitCrimeCheck,
  type CrimeSubmitPayload,
  type ManualPassType,
  subjectReportUrl,
  type AadhaarKyc,
  type PanData,
} from '../lib/api';
import { getToken } from '../lib/session';
import {
  CREDIT_CHECK_ENABLED,
  PASSPORT_CHECK_ENABLED,
} from '../lib/feature-flags';
import {
  CheckCard,
  type CheckDocument,
  type CheckStatus,
  type ComparisonRow as CardComparisonRow,
  type MatchVariant,
  type RequiredInput,
} from './CheckCard';
import FilePreviewModal, { type PreviewFile } from './FilePreviewModal';
import {
  Button,
  Input,
  InputFieldWrapper,
  Tag,
  Textarea,
} from '@/shared/components/ui';

/**
 * Minimal shape this report needs — satisfied by both the client `Subject` and
 * the admin `AdminSubjectDetail` types, so the same view renders on both sides.
 */
export interface SubjectReportData {
  id: string;
  name: string;
  role?: string;
  email?: string;
  phone?: string | null;
  status?: string;
  clientName?: string;
  caseRef?: string;
  amountPaid?: number | null;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  dob?: string | null;
  permanentAddress?: string | null;
  drivingLicense?: string | null;
  voterId?: string | null;
  passportFileNo?: string | null;
  uan?: string | null;
  panResult: unknown;
  aadhaarResult: unknown;
  crimeResult: unknown;
  /** True once our own copy of the court-record PDF exists in S3. */
  hasCrimeReport?: boolean;
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
  consentStatus?: 'PENDING' | 'GRANTED' | 'DECLINED' | 'EXPIRED';
  createdAt?: string;
  updatedAt?: string;
}

interface CrimeCase {
  slNo?: number;
  caseTypeName?: string;
  caseType?: string;
  caseNumber?: string;
  cinNumber?: string;
  firNumber?: string;
  firPoliceStation?: string;
  firDistrict?: string;
  firLink?: string;
  hearingDate?: string;
  caseRegDate?: string;
  filingDate?: string;
  courtName?: string;
  state?: string;
  district?: string;
  underAct?: string;
  section?: string;
  caseStatus?: string;
  riskType?: string;
  riskSummary?: string;
  severity?: string;
  judgementSummary?: string;
  judgementLink?: string;
  petitioner?: string;
  respondent?: string;
  matchSummary?: string;
  caseDetailsLink?: string;
}

interface CrimeReport {
  status?: string;
  request_id?: number | string;
  risk_assessment?: {
    risk_type?: string;
    risk_summary?: string;
    number_of_cases?: number;
  };
  download_link?: string;
  cases?: CrimeCase[];
}

interface PdfPreview {
  url: string;
  title: string;
}

/* ---------- helpers ---------- */

function genderLabel(g?: string | null): string {
  if (g === 'M') return 'Male';
  if (g === 'F') return 'Female';
  return g || '';
}

function firstSentence(s?: string): string {
  if (!s) return '';
  return s.split('\n')[0].trim();
}

function formatAddress(a: AadhaarKyc['address']): string {
  if (!a) return '';
  const parts: string[] = [];
  if (a.house) parts.push(a.house);
  if (a.locality) parts.push(a.locality);
  if (a.vtc) parts.push(a.vtc);
  if (a.postOffice) parts.push(a.postOffice);
  if (a.district) parts.push(a.district);
  if (a.state) parts.push(a.state);
  if (a.pincode) parts.push(a.pincode);
  if (a.country) parts.push(a.country);
  return parts.join(', ');
}

function riskClass(risk?: string): string {
  const r = (risk || '').toLowerCase();
  if (r.includes('no risk')) return 'risk-no';
  if (r.includes('low')) return 'risk-low';
  if (r.includes('medium') || r.includes('moderate')) return 'risk-medium';
  if (r.includes('high') || r.includes('serious') || r.includes('critical'))
    return 'risk-high';
  return 'risk-no';
}

function severityClass(severity?: string): string {
  const s = (severity || '').toLowerCase();
  if (s.includes('critical') || s.includes('high')) return 'rp-sev-high';
  if (s.includes('medium') || s.includes('moderate')) return 'rp-sev-medium';
  if (s.includes('low') || s.includes('minor')) return 'rp-sev-low';
  return 'rp-sev-info';
}

/* ---------- entered-vs-verified comparison ---------- */

type RecallType =
  | 'pan'
  | 'aadhaar'
  | 'voter'
  | 'passport'
  | 'dl'
  | 'employment'
  // Async vendor-polled — recall re-submits and restarts polling.
  | 'crime'
  | 'credit';

type MatchState = 'match' | 'partial' | 'mismatch' | 'na';

function norm(s?: string | null): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function last4(s?: string | null): string {
  return (s || '').replace(/\D/g, '').slice(-4);
}

function eqMatch(a?: string | null, b?: string | null): MatchState {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 'na';
  return x === y ? 'match' : 'mismatch';
}

function nameMatch(entered?: string | null, found?: string | null): MatchState {
  if (!norm(entered) || !norm(found)) return 'na';
  if (norm(entered) === norm(found)) return 'match';
  const at = (entered || '').toLowerCase().split(/\s+/).filter(Boolean);
  const bt = (found || '').toLowerCase().split(/\s+/).filter(Boolean);
  const overlap = at.filter((t) => bt.includes(t)).length;
  if (overlap === 0) return 'mismatch';
  if (overlap === at.length || overlap === bt.length) return 'match';
  return 'partial';
}

/** "20 Jul 2026, 3:45 PM" */
function fmtLongDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Overall TAT as "1d 22h" / "3h 40m" / "12m". */
function tatDuration(createdAt?: string, updatedAt?: string): string {
  if (!createdAt || !updatedAt) return '—';
  const ms = new Date(updatedAt).getTime() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${m}m`;
  return `${m}m`;
}

/** Unwrap a `{ data: {...} }` vendor envelope to the inner object. */
function unwrap(r: Record<string, unknown> | null): Record<string, unknown> {
  if (!r) return {};
  return r.data && typeof r.data === 'object'
    ? (r.data as Record<string, unknown>)
    : r;
}

/** First present string/number value among candidate keys. */
function pick(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (typeof v === 'number') return String(v);
  }
  return '';
}

/** Normalise a DOB (DD-MM-YYYY, DD/MM/YYYY or YYYY-MM-DD) to DD-MM-YYYY. */
function toDobParts(s?: string | null): string | null {
  if (!s) return null;
  const digits = s.match(/\d+/g);
  if (!digits || digits.length < 3) return null;
  let d: string, m: string, y: string;
  if (digits[0].length === 4) [y, m, d] = digits;
  else [d, m, y] = digits;
  return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
}

function dobMatch(a?: string | null, b?: string | null): MatchState {
  const pa = toDobParts(a);
  const pb = toDobParts(b);
  if (!pa || !pb) return 'na';
  return pa === pb ? 'match' : 'mismatch';
}

/** "Completed in 33m" / "Completed in 1h 5m" from created→updated timestamps. */
function formatTat(createdAt?: string, updatedAt?: string): string | undefined {
  if (!createdAt || !updatedAt) return undefined;
  const ms = new Date(updatedAt).getTime() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'Completed in <1m';
  if (mins < 60) return `Completed in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `Completed in ${h}h${m ? ` ${m}m` : ''}`;
}

/**
 * Three-state status: done → the check ran; in-progress → running; then either
 * `pending` (all required inputs present, just awaiting the result) or
 * `unavailable` (the candidate didn't provide the details, so it can't run).
 */
/**
 * The candidate inputs each check sends, and which Subject field each maps to.
 * Drives the recall editor: an operator corrects these, they are saved to the
 * record, and the check re-runs with them. Checks absent from this map have
 * nothing to edit (Aadhaar re-uses a DigiLocker session; crime and credit have
 * their own submission paths) and recall fires immediately.
 */
/** Human labels for the recall dialog heading. */
const RECALL_TITLES: Partial<Record<RecallType, string>> = {
  pan: 'PAN verification',
  voter: 'Voter ID verification',
  passport: 'Passport verification',
  dl: 'Driving licence',
  employment: 'Employment history',
};

const RECALL_FIELDS: Partial<
  Record<
    RecallType,
    ReadonlyArray<{ key: keyof RecheckOverrides; label: string; placeholder: string }>
  >
> = {
  pan: [{ key: 'panNumber', label: 'PAN', placeholder: 'ABCDE1234F' }],
  voter: [{ key: 'voterId', label: 'Voter ID', placeholder: 'ABC1234567' }],
  passport: [
    { key: 'passportFileNo', label: 'File number', placeholder: 'AH1234567' },
    { key: 'dob', label: 'Date of birth', placeholder: 'DD-MM-YYYY' },
  ],
  dl: [
    { key: 'drivingLicense', label: 'Licence number', placeholder: 'HR4120220002535' },
    { key: 'dob', label: 'Date of birth', placeholder: 'DD-MM-YYYY' },
  ],
  employment: [{ key: 'uan', label: 'UAN', placeholder: '123456789012' }],
};

function checkStatus(
  done: boolean,
  inProgress: boolean,
  reqs: RequiredInput[],
): CheckStatus {
  if (done) return 'done';
  if (inProgress) return 'in-progress';
  // An input the verified Aadhaar will supply counts as satisfied: the check IS
  // in scope and will run on its own, so treating it as missing would hide the
  // card from the client and drop it out of the "N/M checks done" ratio — while
  // the engine still counts it. That mismatch is what showed 0/1 for a
  // candidate who bought two checks.
  const ready =
    reqs.length > 0 &&
    reqs.every((r) => Boolean(r.value && r.value.trim()) || r.pending);
  return ready ? 'pending' : 'unavailable';
}

function docsFrom(
  items: Array<[string, string | null | undefined]>,
): CheckDocument[] {
  return items
    .filter(([, url]) => Boolean(url))
    .map(([name, url]) => ({ name, url: url as string }));
}

/**
 * True when the candidate's stored Aadhaar carries every address field the
 * credit bureau requires. Mirrors the backend gate (bgv-address.ts) so the UI
 * explains exactly the condition the engine waits on.
 */
/**
 * True when the Aadhaar KYC carries *any* usable address fragment. The crime
 * vendor takes a free-text address (unlike the credit bureau, which needs every
 * structured field), so this is the looser gate the backend applies there.
 */
/**
 * The vendor's own report file, when the API returns one instead of (or as well
 * as) structured fields — KonnectNxt hands the credit report back as a hosted
 * PDF URL. Mirrors vendorReportUrl in subject-report-html.ts.
 */
function vendorReportUrl(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const isUrl = (v: unknown): v is string =>
    typeof v === 'string' && /^https?:\/\//i.test(v.trim());
  const o = result as Record<string, unknown>;
  if (isUrl(o.data)) return o.data.trim();
  const inner =
    o.data && typeof o.data === 'object'
      ? (o.data as Record<string, unknown>)
      : o;
  // download_link is what KonnectNxt crime-check names the signed PDF link.
  for (const k of ['report_url','reportUrl','download_link','downloadLink','pdf_url','pdfUrl','report','pdf','url','file_url']) {
    if (isUrl(inner[k])) return (inner[k] as string).trim();
    if (isUrl(o[k])) return (o[k] as string).trim();
  }
  return null;
}

/**
 * The Aadhaar address flattened to the single line the crime vendor is actually
 * sent. Mirrors buildBgvAddress + formatAddressLine on the backend, including
 * the city pick (subDistrict → district minus its admin suffix → vtc), so the
 * report shows exactly what went to the source rather than a placeholder.
 */
function aadhaarAddressLine(result: unknown): string {
  if (!result || typeof result !== 'object' || '__checkError' in result) {
    return '';
  }
  const address = (result as { address?: Record<string, unknown> }).address;
  if (!address || typeof address !== 'object') return '';
  const val = (k: string): string => String(address[k] ?? '').trim();

  const street = ['house', 'street', 'locality', 'landmark']
    .map(val)
    .filter(Boolean)
    .join(', ');
  const city =
    val('subDistrict') ||
    val('district').replace(/\s+(Nagar|District|Rural|Urban)$/i, '').trim() ||
    val('vtc');

  return [street, city, val('state'), val('pincode'), val('country') || 'India']
    .filter(Boolean)
    .join(', ');
}

function aadhaarHasAddress(result: unknown): boolean {
  if (!result || typeof result !== 'object' || '__checkError' in result) {
    return false;
  }
  const address = (result as { address?: Record<string, unknown> }).address;
  if (!address || typeof address !== 'object') return false;
  return ['house', 'street', 'locality', 'landmark', 'vtc', 'subDistrict',
    'district', 'state', 'pincode']
    .some((k) => String(address[k] ?? '').trim().length > 0);
}

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
 * Resolve the candidate's father's name the same way the backend does
 * (Aadhaar care-of → PAN → typed form value), so the card never asks for
 * something Aadhaar already supplied. W/O is skipped — that's a husband, not
 * a father.
 */
function resolveFatherName(subject: {
  aadhaarResult?: unknown;
  panResult?: unknown;
  fatherName?: string | null;
}): string {
  const pick = (result: unknown): string => {
    if (!result || typeof result !== 'object' || '__checkError' in result) {
      return '';
    }
    const outer = result as Record<string, unknown>;
    const data =
      outer.data && typeof outer.data === 'object'
        ? (outer.data as Record<string, unknown>)
        : outer;
    for (const key of ['father_name', 'fathers_name', 'fatherName']) {
      const v = data[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };

  const aadhaar =
    subject.aadhaarResult &&
    typeof subject.aadhaarResult === 'object' &&
    !('__checkError' in subject.aadhaarResult)
      ? (subject.aadhaarResult as { address?: { careOf?: string | null } })
      : null;
  const careOf = (aadhaar?.address?.careOf ?? '').trim();
  const fromCareOf =
    careOf && !/^w\s*\/\s*o\b/i.test(careOf)
      ? careOf.replace(/^(?:s\s*\/\s*o|d\s*\/\s*o|c\s*\/\s*o)\s*:?\s*/i, '').trim()
      : '';

  return (
    pick(subject.aadhaarResult) ||
    fromCareOf ||
    pick(subject.panResult) ||
    (subject.fatherName ?? '').trim()
  );
}

/* ---------- report ---------- */

export default function SubjectReport({
  subject,
  onRefresh,
  refreshing = false,
  onSubjectUpdate,
  onBack,
  admin = false,
}: {
  subject: SubjectReportData;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Called with the refreshed subject after a "Recall API" re-run. */
  onSubjectUpdate?: (updated: SubjectReportData) => void;
  /** When provided, an inline back arrow renders before the name. */
  onBack?: () => void;
  /** Admin view: shows inapplicable ("Not provided") checks + Recall buttons. */
  admin?: boolean;
}) {
  // A stored `{ __checkError }` = a genuine failed lookup (invalid / not
  // found). Pull the message so the card can show it, and treat the result as
  // "no data" for readouts/comparisons.
  const errOf = (r: unknown): string | null =>
    r && typeof r === 'object' && '__checkError' in r
      ? String((r as { __checkError: unknown }).__checkError)
      : null;

  // A vendor failure still awaiting an operator decision. Clients see the check
  // as in progress; only admins see that it failed. Stamped __resolvedAt once
  // released, at which point everyone sees "Unable to verify".
  const unresolved = (r: unknown): boolean =>
    Boolean(errOf(r)) &&
    !(r && typeof r === 'object' && '__resolvedAt' in (r as object));

  // An admin passed this check by hand because the vendor could not answer.
  // Surfaced as its own status so the report never implies the source
  // confirmed it.
  const manualOf = (
    r: unknown,
  ): { passedBy: string; passedAt: string; reason: string | null } | null => {
    if (!r || typeof r !== 'object' || !('__manualOverride' in r)) return null;
    const m = r as {
      passedBy?: unknown;
      passedAt?: unknown;
      reason?: unknown;
    };
    return {
      passedBy: String(m.passedBy ?? 'an administrator'),
      passedAt: String(m.passedAt ?? ''),
      reason: m.reason ? String(m.reason) : null,
    };
  };

  const panErr = errOf(subject.panResult);
  const aadhaarErr = errOf(subject.aadhaarResult);
  const dlErr = errOf(subject.dlResult);
  const voterErr = errOf(subject.voterResult);
  const passportErr = errOf(subject.passportResult);
  const employmentErr = errOf(subject.employmentResult);
  // Crime and credit were missing this: a stored { __checkError } was being
  // treated as a successful result, so a FAILED criminal-records lookup
  // rendered as "Completed — 0 cases found".
  const crimeErr = errOf(subject.crimeResult);
  const creditErr = errOf(subject.creditResult);

  // Admin manual overrides, per check.
  const panManual = manualOf(subject.panResult);
  const aadhaarManual = manualOf(subject.aadhaarResult);
  const dlManual = manualOf(subject.dlResult);
  const voterManual = manualOf(subject.voterResult);
  const passportManual = manualOf(subject.passportResult);
  const employmentManual = manualOf(subject.employmentResult);
  const crimeManual = manualOf(subject.crimeResult);
  const creditManual = manualOf(subject.creditResult);

  const pan = (panErr || panManual ? null : subject.panResult) as PanData | null;
  const aadhaar = (aadhaarErr || aadhaarManual ? null : subject.aadhaarResult) as AadhaarKyc | null;
  const crime = (crimeErr || crimeManual ? null : subject.crimeResult) as { data?: CrimeReport } | null;
  const crimeReport: CrimeReport = crime?.data ?? {};
  const crimePending = Boolean(subject.crimeRequestId) && !crime;
  const dlStarted = Boolean(subject.digilockerClientId);
  // Aadhaar is "in progress" once there's something to verify (the number was
  // entered / the link was sent) — even before the candidate opens DigiLocker,
  // because we're now awaiting them. Only truly "not provided" when no Aadhaar
  // was entered at all.
  const dlPending = !aadhaar && (dlStarted || Boolean(subject.aadhaarNumber));
  const panPending = Boolean(subject.panNumber) && !pan && !panErr;

  const drivingLicence = (dlErr || dlManual ? null : subject.dlResult ?? null) as Record<string, unknown> | null;
  const voter = (voterErr || voterManual ? null : subject.voterResult ?? null) as Record<string, unknown> | null;
  const passport = (passportErr || passportManual ? null : subject.passportResult ?? null) as Record<string, unknown> | null;
  const employment = (employmentErr || employmentManual ? null : subject.employmentResult ?? null) as Record<string, unknown> | null;
  const credit = (creditErr || creditManual ? null : subject.creditResult ?? null) as Record<string, unknown> | null;


  const [docPreview, setDocPreview] = useState<PreviewFile | null>(null);
  const [recalling, setRecalling] = useState<string | null>(null);
  const [passing, setPassing] = useState<string | null>(null);
  // Manual-override confirmation panel: which check, why, and any error.
  const [manualTarget, setManualTarget] = useState<{
    type: ManualPassType;
    label: string;
    mode: 'passed' | 'unable';
  } | null>(null);
  const [manualReason, setManualReason] = useState('');
  const [manualError, setManualError] = useState('');
  // Recall-with-edits dialog: which check, and any error from the last attempt.
  const [recallTarget, setRecallTarget] = useState<RecallType | null>(null);
  const [recallError, setRecallError] = useState('');
  // Operator-entered crime submission (admin only).
  const [crimeSubmitOpen, setCrimeSubmitOpen] = useState(false);
  const [crimeSubmitting, setCrimeSubmitting] = useState(false);
  const [crimeSubmitError, setCrimeSubmitError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  // Mobile kebab menu holding the report actions (desktop shows them inline).
  const [actionsOpen, setActionsOpen] = useState(false);

  useEffect(() => {
    if (!actionsOpen) return;
    const close = () => setActionsOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [actionsOpen]);
  // TAT is an internal/admin metric — hidden on the client ("employee") side.
  const tat = admin ? formatTat(subject.createdAt, subject.updatedAt) : undefined;

  async function handleSendLink() {
    if (!subject.id) return;
    setSendingLink(true);
    try {
      const res = await adminSendVerificationLink(subject.id);
      alert(
        res.emailSent
          ? `Verification link emailed to ${subject.email || 'the candidate'}.`
          : `Email couldn't be sent — share this link:\n${res.url}`,
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not send the link.');
    } finally {
      setSendingLink(false);
    }
  }

  async function handleDownload() {
    const token = getToken();
    if (!token || !subject.id) return;
    setDownloading(true);
    try {
      await downloadSubjectReport(token, subject.id, subject.name);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : 'Could not generate the report.',
      );
    } finally {
      setDownloading(false);
    }
  }

  async function handleRecall(type: RecallType, overrides?: RecheckOverrides) {
    const token = getToken();
    if (!token || !subject.id) return;
    setRecalling(type);
    setRecallError('');
    try {
      const updated = await recheckSubject(token, subject.id, type, overrides);
      onSubjectUpdate?.(updated as unknown as SubjectReportData);
      setRecallTarget(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not re-run this check.';
      // Inside the dialog the message belongs next to the fields that caused
      // it; without one there is nowhere to put it but an alert.
      if (recallTarget) setRecallError(msg);
      else alert(msg);
    } finally {
      setRecalling(null);
    }
  }

  async function confirmManualPass() {
    if (!subject.id || !manualTarget) return;
    setPassing(manualTarget.type);
    setManualError('');
    try {
      const updated = await manualPassCheck(
        subject.id,
        manualTarget.type,
        manualReason.trim(),
        manualTarget.mode,
      );
      onSubjectUpdate?.(updated as unknown as SubjectReportData);
      setManualTarget(null);
      setManualReason('');
    } catch (err) {
      setManualError(
        err instanceof Error ? err.message : 'Could not mark this check passed.',
      );
    } finally {
      setPassing(null);
    }
  }

  async function confirmCrimeSubmit(payload: CrimeSubmitPayload) {
    if (!subject.id) return;
    setCrimeSubmitting(true);
    setCrimeSubmitError('');
    try {
      const updated = await submitCrimeCheck(subject.id, {
        name: payload.name.trim(),
        fatherName: payload.fatherName?.trim() || undefined,
        dob: payload.dob?.trim() || undefined,
        address: payload.address?.trim() || undefined,
        panNumber: payload.panNumber?.trim() || undefined,
      });
      onSubjectUpdate?.(updated as unknown as SubjectReportData);
      setCrimeSubmitOpen(false);
    } catch (err) {
      setCrimeSubmitError(
        err instanceof Error ? err.message : 'Could not submit this check.',
      );
    } finally {
      setCrimeSubmitting(false);
    }
  }

  // Per-check "Candidate said vs Data found" comparison rows.
  const panCompare: CardComparisonRow[] = pan
    ? [
        {
          key: 'pan',
          label: 'PAN Number',
          candidateSaid: subject.panNumber ?? null,
          dataFound: pan.pan_number ?? null,
          match: eqMatch(subject.panNumber, pan.pan_number),
        },
        {
          key: 'name',
          label: 'Full Name',
          candidateSaid: subject.name ?? null,
          dataFound: pan.full_name ?? null,
          match: nameMatch(subject.name, pan.full_name),
        },
        ...(pan.dob
          ? [
              {
                key: 'dob',
                label: 'Date of birth',
                candidateSaid: subject.dob ?? null,
                dataFound: pan.dob,
                match: dobMatch(subject.dob, pan.dob),
              },
            ]
          : []),
      ]
    : [];

  const aadhaarCompare: CardComparisonRow[] = aadhaar
    ? [
        {
          key: 'aadhaar',
          label: 'Aadhaar (last 4)',
          candidateSaid: last4(subject.aadhaarNumber)
            ? `•••• ${last4(subject.aadhaarNumber)}`
            : null,
          dataFound: aadhaar.uidMasked ?? null,
          match:
            last4(subject.aadhaarNumber) && last4(aadhaar.uidMasked)
              ? eqMatch(last4(subject.aadhaarNumber), last4(aadhaar.uidMasked))
              : ('na' as MatchVariant),
        },
        {
          key: 'name',
          label: 'Full Name',
          candidateSaid: subject.name ?? null,
          dataFound: aadhaar.name ?? null,
          match: nameMatch(subject.name, aadhaar.name),
        },
        {
          key: 'dob',
          label: 'Date of birth',
          candidateSaid: subject.dob ?? null,
          dataFound: aadhaar.dob ?? null,
          match: dobMatch(subject.dob, aadhaar.dob),
        },
      ]
    : [];

  // Voter / Passport / Driving-licence comparisons — pulled from the vendor
  // result (shapes vary, so we probe several likely key names).
  const voterData = unwrap(voter);
  const voterCompare: CardComparisonRow[] = voter
    ? [
        {
          key: 'voter',
          label: 'Voter ID',
          candidateSaid: subject.voterId ?? null,
          dataFound:
            pick(voterData, ['epic_no', 'epic_number', 'voter_id']) || null,
          match: eqMatch(
            subject.voterId,
            pick(voterData, ['epic_no', 'epic_number', 'voter_id']),
          ),
        },
        {
          key: 'name',
          label: 'Full Name',
          candidateSaid: subject.name ?? null,
          dataFound: pick(voterData, ['name', 'full_name']) || null,
          match: nameMatch(subject.name, pick(voterData, ['name', 'full_name'])),
        },
      ]
    : [];

  const passportData = unwrap(passport);
  const passportFound = pick(passportData, [
    'file_number',
    'passport_file_number',
    'file_no',
    'passport_no',
  ]);
  const passportCompare: CardComparisonRow[] = passport
    ? [
        {
          key: 'file',
          label: 'File number',
          candidateSaid: subject.passportFileNo ?? null,
          dataFound: passportFound || null,
          match: eqMatch(subject.passportFileNo, passportFound),
        },
        {
          key: 'name',
          label: 'Full Name',
          candidateSaid: subject.name ?? null,
          dataFound: pick(passportData, ['name', 'full_name']) || null,
          match: nameMatch(
            subject.name,
            pick(passportData, ['name', 'full_name']),
          ),
        },
        {
          key: 'dob',
          label: 'Date of birth',
          candidateSaid: subject.dob ?? null,
          dataFound: pick(passportData, ['dob', 'date_of_birth']) || null,
          match: dobMatch(
            subject.dob,
            pick(passportData, ['dob', 'date_of_birth']),
          ),
        },
      ]
    : [];

  const employmentData = unwrap(employment);
  const employmentCompare: CardComparisonRow[] = employment
    ? [
        {
          key: 'uan',
          label: 'UAN',
          candidateSaid: subject.uan ?? null,
          dataFound: pick(employmentData, ['uan', 'uan_number']) || null,
          match: eqMatch(subject.uan, pick(employmentData, ['uan', 'uan_number'])),
        },
        {
          key: 'name',
          label: 'Full Name',
          candidateSaid: subject.name ?? null,
          dataFound:
            pick(employmentData, ['name', 'full_name', 'member_name']) || null,
          match: nameMatch(
            subject.name,
            pick(employmentData, ['name', 'full_name', 'member_name']),
          ),
        },
      ]
    : [];

  const dlData = unwrap(drivingLicence);
  const dlFound = pick(dlData, [
    'license_number',
    'licence_number',
    'dl_number',
    'driving_license_number',
  ]);
  const dlCompare: CardComparisonRow[] = drivingLicence
    ? [
        {
          key: 'dl',
          label: 'Licence number',
          candidateSaid: subject.drivingLicense ?? null,
          dataFound: dlFound || null,
          match: eqMatch(subject.drivingLicense, dlFound),
        },
        {
          key: 'name',
          label: 'Full Name',
          candidateSaid: subject.name ?? null,
          dataFound: pick(dlData, ['name', 'full_name']) || null,
          match: nameMatch(subject.name, pick(dlData, ['name', 'full_name'])),
        },
        {
          key: 'dob',
          label: 'Date of birth',
          candidateSaid: subject.dob ?? null,
          dataFound: pick(dlData, ['dob', 'date_of_birth']) || null,
          match: dobMatch(subject.dob, pick(dlData, ['dob', 'date_of_birth'])),
        },
      ]
    : [];

  const panDocs = docsFrom([
    ['PAN Card (front)', subject.panFront],
    ['PAN Card (back)', subject.panBack],
  ]);
  const aadhaarDocs = docsFrom([
    ['Aadhaar (front)', subject.aadhaarFront],
    ['Aadhaar (back)', subject.aadhaarBack],
  ]);

  // What each check needs from the candidate — drives the requirement chips and
  // gates the Recall button.
  // The candidate-provided input is the Aadhaar number; DigiLocker is the
  // verification method (its progress shows in the status/pending tile), not a
  // "required input" — so don't render it as "not provided".
  const aadhaarReqs: RequiredInput[] = [
    { label: 'Aadhaar number', value: subject.aadhaarNumber },
  ];
  const panReqs: RequiredInput[] = [
    { label: 'PAN number', value: subject.panNumber },
  ];
  const dlReqs: RequiredInput[] = [
    { label: 'Licence number', value: subject.drivingLicense },
    { label: 'Date of birth', value: subject.dob },
  ];
  const voterReqs: RequiredInput[] = [
    { label: 'Voter ID', value: subject.voterId },
  ];
  const passportReqs: RequiredInput[] = [
    { label: 'File number', value: subject.passportFileNo },
    { label: 'Date of birth', value: subject.dob },
  ];
  const employmentReqs: RequiredInput[] = [
    { label: 'UAN', value: subject.uan },
  ];
  // Crime & credit have no Recall button, but the chips still show what the
  // candidate must provide before these can run.
  // Mirrors the engine: DOB, address and father's name may each come from the
  // form OR the verified Aadhaar, so a blank form field doesn't make the check
  // inapplicable while DigiLocker can still supply it.
  const aadhaarKycDob = String(
    (subject.aadhaarResult as { dob?: unknown } | null)?.dob ?? '',
  ).trim();
  const crimeDobValue = subject.dob || aadhaarKycDob;
  const crimeAddressValue = subject.permanentAddress?.trim()
    ? subject.permanentAddress
    : aadhaarHasAddress(subject.aadhaarResult)
      ? aadhaarAddressLine(subject.aadhaarResult)
      : '';
  // Mirrors subject-progress.ts `aadhaarMayArrive`: DigiLocker is still
  // expected, so DOB / address / father's name it supplies are on the way
  // rather than missing. Any stored aadhaarResult settles the question —
  // including a failure, which is why this tests the result, not success.
  const aadhaarMayArrive =
    !subject.aadhaarResult &&
    Boolean(subject.digilockerClientId || subject.aadhaarNumber);
  // Vendor-supplied report files (KonnectNxt returns these as hosted PDFs).
  const creditReportUrl = vendorReportUrl(subject.creditResult);
  // Our own endpoint, never the vendor's Google Storage link — that URL is
  // unauthenticated to anyone holding it, outside our control to expire, and
  // names our supplier. vendorReportUrl remains the fallback for older results
  // stored before the PDF was archived on our side.
  const crimeReportUrl =
    subject.hasCrimeReport && subject.id
      ? crimeReportPdfUrl(subject.id)
      : vendorReportUrl(subject.crimeResult);
  const creditDocs: CheckDocument[] = creditReportUrl
    ? [{ name: 'Credit bureau report (PDF)', url: creditReportUrl, contentType: 'application/pdf' }]
    : [];
  const crimeDocs: CheckDocument[] = crimeReportUrl
    ? [{ name: 'Court record report (PDF)', url: crimeReportUrl, contentType: 'application/pdf' }]
    : [];

  const crimeReqs: RequiredInput[] = [
    { label: 'Full name', value: subject.name },
    { label: 'Date of birth', value: crimeDobValue, pending: aadhaarMayArrive },
    { label: 'Address', value: crimeAddressValue, pending: aadhaarMayArrive },
    {
      label: "Father's name",
      value: resolveFatherName(subject),
      pending: aadhaarMayArrive,
    },
  ];
  // The credit bureau needs PAN + DOB + father's name, and takes the address
  // from the candidate's verified Aadhaar (a typed address is rejected).
  const creditAadhaarReady = aadhaarAddressComplete(subject.aadhaarResult);
  const creditFatherName = resolveFatherName(subject);
  const creditPhone =
    String(subject.phone ?? '').replace(/\D/g, '').length >= 10;
  const creditReqs: RequiredInput[] = [
    { label: 'PAN number', value: subject.panNumber },
    { label: 'Date of birth', value: subject.dob },
    { label: "Father's name", value: creditFatherName },
    { label: 'Phone number', value: subject.phone },
    {
      label: 'Verified Aadhaar address',
      value: creditAadhaarReady ? 'Available' : '',
    },
  ];

  // Per-check status (drives the tag, the progress ratio, and — on the client
  // side — whether an inapplicable "Not provided" card is shown at all).
  const aadhaarStatus = aadhaarErr
    ? 'failed'
    : aadhaarManual
      ? 'manual'
      : checkStatus(Boolean(aadhaar), dlPending, aadhaarReqs);
  const panStatus = panManual
    ? 'manual'
    : panErr
      ? (!admin && unresolved(subject.panResult) ? 'pending' : 'failed')
      : checkStatus(Boolean(pan), panPending, panReqs);
  const dlStatus = dlManual
    ? 'manual'
    : dlErr
      ? (!admin && unresolved(subject.dlResult) ? 'pending' : 'failed')
      : checkStatus(Boolean(drivingLicence), false, dlReqs);
  const voterStatus = voterManual
    ? 'manual'
    : voterErr
      ? (!admin && unresolved(subject.voterResult) ? 'pending' : 'failed')
      : checkStatus(Boolean(voter), false, voterReqs);
  const passportStatus = passportManual
    ? 'manual'
    : passportErr
      ? (!admin && unresolved(subject.passportResult) ? 'pending' : 'failed')
      : checkStatus(Boolean(passport), false, passportReqs);
  const employmentStatus = employmentManual
    ? 'manual'
    : employmentErr
      ? (!admin && unresolved(subject.employmentResult) ? 'pending' : 'failed')
      : checkStatus(Boolean(employment), false, employmentReqs);
  const crimeStatusVal = crimeManual
    ? 'manual'
    : crimeErr
      ? (!admin && unresolved(subject.crimeResult) ? 'pending' : 'failed')
      : checkStatus(Boolean(crime), crimePending, crimeReqs);
  const creditStatus = creditManual
    ? 'manual'
    : creditErr
      ? (!admin && unresolved(subject.creditResult) ? 'pending' : 'failed')
      : checkStatus(
        Boolean(credit),
        Boolean(subject.creditRequestId),
        creditReqs,
      );

  // Consent refused / expired ⇒ the case is closed: no check ever ran and the
  // charge was refunded, so the live check cards would be misleading.
  const consentClosed =
    subject.consentStatus === 'DECLINED' || subject.consentStatus === 'EXPIRED';
  // Consent has been answered either way — granted, refused or lapsed. The
  // verification link only asks for that answer, so once it exists there is
  // nothing left to send and offering it invites a pointless second email.
  // An absent status is treated as still-pending, so older records keep it.
  const consentDecided =
    subject.consentStatus === 'GRANTED' || consentClosed;

  const cardStatuses: CheckStatus[] = [
    aadhaarStatus,
    panStatus,
    dlStatus,
    voterStatus,
    ...(PASSPORT_CHECK_ENABLED ? [passportStatus] : []),
    employmentStatus,
    crimeStatusVal,
    // Credit is switched off for now — excluded from the ratio as well as the
    // card list, so a stored result can't hold the report open.
    ...(CREDIT_CHECK_ENABLED ? [creditStatus] : []),
  ];
  const applicableCount = cardStatuses.filter(
    (s) => s !== 'unavailable',
  ).length;
  // A check counts as "done" once it has finished processing — including a
  // Failed (invalid / not found) result, which is a terminal state, not pending,
  // and a manual override, which is an admin-recorded outcome.
  const doneCount = cardStatuses.filter(
    (s) => s === 'done' || s === 'failed' || s === 'manual',
  ).length;
  // Manually-verified counts as a pass: the admin confirmed it offline because
  // the source couldn't answer, so it completes the check rather than failing it.
  const successCount = cardStatuses.filter(
    (s) => s === 'done' || s === 'manual',
  ).length;
  // Green only when every applicable check actually succeeded (no failures).
  const allDone = applicableCount > 0 && successCount === applicableCount;
  // Overall TAT = time from initiation until every applicable check finishes.
  // Once complete, that's start → last completion (updatedAt); while still
  // running, show the elapsed time so far (start → now).
  const allChecksComplete = applicableCount > 0 && doneCount === applicableCount;
  const overallTat = tatDuration(
    subject.createdAt,
    allChecksComplete ? subject.updatedAt : new Date().toISOString(),
  );

  // On the client ("employee") side, hide inapplicable checks and the Recall
  // button — those are internal/admin concerns.
  const show = (s: CheckStatus) => admin || s !== 'unavailable';
  // Checks whose inputs an operator can correct before re-running. A failed
  // licence check is usually a typo, not a vendor problem, so re-sending the
  // same wrong number is pointless — open the editor instead of firing.
  const recall = (type: RecallType) =>
    admin
      ? () => {
          if (RECALL_FIELDS[type]?.length) {
            setRecallError('');
            setRecallTarget(type);
          } else {
            void handleRecall(type);
          }
        }
      : undefined;

  // Admin-only escape hatch, offered on any check that isn't already settled by
  // the vendor — i.e. failed, stuck in progress, or awaiting the candidate.
  const manualPass = (
    type: ManualPassType,
    label: string,
    status: CheckStatus,
  ) =>
    admin && status !== 'done' && status !== 'manual'
      ? () => {
          setManualReason('');
          setManualError('');
          setManualTarget({ type, label, mode: 'passed' });
        }
      : undefined;

  // Release a failed check to the client as "Unable to verify" — admin only,
  // and only while the failure is still unresolved.
  const release = (type: ManualPassType, label: string, result: unknown) =>
    admin && unresolved(result)
      ? () => {
          setManualReason('');
          setManualError('');
          setManualTarget({ type, label, mode: 'unable' });
        }
      : undefined;

  return (
    <div className="rp">
      {/* Consent lifecycle — checks are locked until the candidate agrees;
          declined/expired means the charge was auto-refunded to the wallet. */}
      {subject.consentStatus === 'PENDING' && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-border-warning bg-surface-warning px-4 py-3 text-body-md text-text-body">
          <Clock size={16} className="mt-0.5 shrink-0 text-warning" />
          <span>
            <strong>Awaiting candidate consent.</strong> Checks start as soon as{' '}
            {subject.name.split(' ')[0]} agrees via the verification link. If
            they decline or don&apos;t respond within 7 days, the full charge is
            refunded to your wallet automatically.
          </span>
        </div>
      )}
      {/* Header — Recriauth-style: title row + candidate detail card */}
      <header className="mb-6">
        {/* Mobile: name with the case ref stacked under it and the action
            buttons full-width below; the checks chip moves to the end of the
            Details card. Desktop keeps the single inline row. */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
          <div className="flex min-w-0 items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-text-heading transition-colors hover:bg-neutral-200"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold text-text-heading">
                {subject.name}
              </h1>
              {subject.caseRef && (
                <span className="mt-0.5 block text-body-sm font-medium text-text-placeholder md:hidden">
                  #{subject.caseRef}
                </span>
              )}
            </div>
            {subject.caseRef && (
              <span className="hidden text-body-sm font-medium text-text-placeholder md:inline">
                #{subject.caseRef}
              </span>
            )}
            <span className="hidden md:inline-flex">
              <Tag
                variant={consentClosed ? 'Failure' : allDone ? 'Success' : 'Warning'}
                label={
                  consentClosed
                    ? subject.consentStatus === 'DECLINED'
                      ? 'Refused'
                      : 'Expired'
                    : `${doneCount}/${applicableCount} checks done`
                }
              />
            </span>
            {/* Mobile: every report action collapses into this kebab menu. */}
            <div className="relative ml-auto md:hidden">
              <button
                type="button"
                aria-label="Report actions"
                aria-haspopup="menu"
                aria-expanded={actionsOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setActionsOpen((o) => !o);
                }}
                className={`inline-flex size-9 items-center justify-center rounded-full text-text-heading transition-colors hover:bg-neutral-200 ${
                  actionsOpen ? 'bg-neutral-200' : ''
                }`}
              >
                <MoreVertical size={18} />
              </button>
              {actionsOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-1 w-60 rounded-md border border-neutral-500 bg-white py-1 shadow-[0px_3px_10px_0px_rgba(11,26,59,0.1)]"
                >
                  {!consentDecided && (
                    <button
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-body-md font-medium text-text-body transition-colors hover:bg-neutral-200"
                      disabled={sendingLink}
                      onClick={() => {
                        setActionsOpen(false);
                        void handleSendLink();
                      }}
                    >
                      <Send size={14} />
                      {sendingLink ? 'Sending…' : 'Send verification link'}
                    </button>
                  )}
                  <button
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-body-md font-medium text-text-body transition-colors hover:bg-neutral-200"
                    onClick={() => {
                      setActionsOpen(false);
                      setDocPreview({
                        url: subjectReportUrl(subject.id),
                        name: 'Background Verification Report',
                        contentType: 'application/pdf',
                      });
                    }}
                  >
                    <FileText size={14} />
                    Preview report
                  </button>
                  <button
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-body-md font-medium text-text-body transition-colors hover:bg-neutral-200"
                    disabled={downloading}
                    onClick={() => {
                      setActionsOpen(false);
                      void handleDownload();
                    }}
                  >
                    <Download size={14} />
                    {downloading ? 'Preparing…' : 'Download report'}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="hidden gap-2 md:ml-auto md:flex md:items-center">
            {!consentDecided && (
              <button
                className="rp-refresh"
                onClick={handleSendLink}
                disabled={sendingLink}
                title="Email the candidate their verification link (consent + Aadhaar)"
              >
                <Send size={13} className={sendingLink ? 'rp-refresh-spin' : ''} />
                {sendingLink ? 'Sending…' : 'Send verification link'}
              </button>
            )}
            <button
              className="rp-refresh"
              onClick={() =>
                // Opens in the page's own preview modal rather than a new tab —
                // the report is read alongside the checks it summarises, and a
                // popup blocker can't swallow it.
                setDocPreview({
                  url: subjectReportUrl(subject.id),
                  name: 'Background Verification Report',
                  contentType: 'application/pdf',
                })
              }
              title="Preview the full report"
            >
              <FileText size={13} />
              Preview report
            </button>
            <button
              className="rp-refresh"
              onClick={handleDownload}
              disabled={downloading}
              title="Download the full report as a PDF"
            >
              <Download
                size={13}
                className={downloading ? 'rp-refresh-spin' : ''}
              />
              {downloading ? 'Preparing…' : 'Download report'}
            </button>
            {/* Nothing left to poll for once every applicable check has
                settled — a Refresh that can never change anything reads as a
                broken button. */}
            {onRefresh && !allChecksComplete && (
              <button
                className="rp-refresh"
                onClick={onRefresh}
                disabled={refreshing}
                title="Refresh"
              >
                <RefreshCw
                  size={13}
                  className={refreshing ? 'rp-refresh-spin' : ''}
                />
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border-default bg-white p-6">
          {/* Card header: Details title with the checks chip on the same row
              (chip is here on mobile only — desktop shows it beside the name). */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-text-heading">Details</h2>
            <span className="md:hidden">
              <Tag
                variant={consentClosed ? 'Failure' : allDone ? 'Success' : 'Warning'}
                label={
                  consentClosed
                    ? subject.consentStatus === 'DECLINED'
                      ? 'Refused'
                      : 'Expired'
                    : `${doneCount}/${applicableCount} checks done`
                }
              />
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
            <HeadField label="Full Name" value={subject.name} />
            <HeadField label="Email" value={subject.email} />
            <HeadField label="Phone number" value={subject.phone} />
            <HeadField label="Client" value={subject.clientName} />
            <HeadField label="Role" value={subject.role} />
            <HeadField
              label="Initiated date"
              value={fmtLongDate(subject.createdAt)}
            />
            <HeadField
              label="Amount paid"
              value={
                typeof subject.amountPaid === 'number'
                  ? '₹' +
                    subject.amountPaid.toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })
                  : null
              }
              pill={
                consentClosed ? (
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-surface-success px-2 py-0.5 text-body-sm font-medium text-success">
                    Refunded
                  </span>
                ) : undefined
              }
            />
            {admin && <HeadField label="Overall TAT" value={overallTat} />}
          </div>
        </div>
      </header>

      {consentClosed ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border-default bg-neutral-100 px-6 py-12 text-center">
          <XCircle className="size-9 text-failure" />
          <h2 className="text-lg font-semibold text-text-heading">
            {subject.consentStatus === 'DECLINED'
              ? 'Verification closed — consent declined'
              : 'Verification closed — consent expired'}
          </h2>
          <p className="max-w-md text-body-md text-text-body">
            {subject.consentStatus === 'DECLINED'
              ? `${subject.name.split(' ')[0]} declined the consent request, so no checks were run on their details.`
              : `${subject.name.split(' ')[0]} didn’t respond to the consent request in time, so no checks were run on their details.`}{' '}
            The full charge has been refunded to your wallet.
          </p>
          <p className="text-body-sm text-text-subheading">
            To try again, start a new verification for this candidate.
          </p>
        </div>
      ) : (
        <>
      {/* 1 · Aadhaar */}
      {show(aadhaarStatus) && (
      <CheckCard
        admin={admin}
        title="Aadhaar (DigiLocker)"
        status={aadhaarStatus}
        order={aadhaarStatus === 'unavailable' ? 1 : 0}
        tat={aadhaar ? tat : undefined}
        idNumber={aadhaar?.uidMasked ?? subject.aadhaarNumber ?? undefined}
        documents={aadhaarDocs}
        comparison={aadhaarCompare}
        onPreview={setDocPreview}
        onResend={aadhaar ? undefined : () => void handleSendLink()}
        resending={sendingLink}
        onManualPass={manualPass('aadhaar', 'Aadhaar (DigiLocker)', aadhaarStatus)}
        passing={passing === 'aadhaar'}
        onRelease={release('aadhaar', 'Aadhaar (DigiLocker)', subject.aadhaarResult)}
        requirements={aadhaarReqs}
      >
        {aadhaarErr ? (
          <ErrorTile message={aadhaarErr} admin={admin} unresolved={unresolved(subject.aadhaarResult)} />
        ) : aadhaar ? (
          <AadhaarReadout a={aadhaar} />
        ) : (
          <PendingTile
            label="Aadhaar verification"
            hint={
              dlStarted
                ? 'DigiLocker consent in progress.'
                : 'Awaiting the candidate to complete Aadhaar verification via DigiLocker.'
            }
          />
        )}
      </CheckCard>
      )}

      {/* 2 · PAN */}
      {show(panStatus) && (
      <CheckCard
        admin={admin}
        title="PAN Card"
        status={panStatus}
        order={panStatus === 'unavailable' ? 1 : 0}
        tat={pan ? tat : undefined}
        idNumber={pan?.pan_number ?? subject.panNumber ?? undefined}
        documents={panDocs}
        comparison={panCompare}
        onPreview={setDocPreview}
        onRecall={recall('pan')}
        recalling={recalling === 'pan'}
        onManualPass={manualPass('pan', 'PAN', panStatus)}
        passing={passing === 'pan'}
        onRelease={release('pan', 'PAN', subject.panResult)}
        requirements={panReqs}
      >
        {panManual ? (
          <ManualTile info={panManual} />
        ) : panErr ? (
          <ErrorTile message={panErr} admin={admin} unresolved={unresolved(subject.panResult)} />
        ) : pan ? (
          <PanReadout pan={pan} />
        ) : panPending ? (
          <PendingTile
            label="PAN verification"
            hint={`PAN ${subject.panNumber} submitted — awaiting verification result.`}
          />
        ) : (
          <PendingTile
            label="PAN verification"
            hint="The candidate hasn't submitted their PAN yet."
          />
        )}
      </CheckCard>
      )}

      {/* 3 · Driving licence */}
      {show(dlStatus) && (
      <CheckCard
        admin={admin}
        title="Driving licence"
        status={dlStatus}
        order={dlStatus === 'unavailable' ? 1 : 0}
        tat={drivingLicence ? tat : undefined}
        onRecall={recall('dl')}
        recalling={recalling === 'dl'}
        onManualPass={manualPass('dl', 'Driving Licence', dlStatus)}
        passing={passing === 'dl'}
        onRelease={release('dl', 'Driving Licence', subject.dlResult)}
        requirements={dlReqs}
        comparison={dlCompare}
      >
        {dlManual ? (
          <ManualTile info={dlManual} />
        ) : dlErr ? (
          <ErrorTile message={dlErr} admin={admin} unresolved={unresolved(subject.dlResult)} />
        ) : drivingLicence ? (
          <GenericReadout result={drivingLicence} />
        ) : (
          <PendingTile
            label="Driving licence check"
            hint={
              dlStatus === 'unavailable'
                ? 'No driving licence provided yet.'
                : 'Details submitted — awaiting the vendor result.'
            }
          />
        )}
      </CheckCard>
      )}

      {/* 4 · Voter ID */}
      {show(voterStatus) && (
      <CheckCard
        admin={admin}
        title="Voter ID"
        status={voterStatus}
        order={voterStatus === 'unavailable' ? 1 : 0}
        tat={voter ? tat : undefined}
        onRecall={recall('voter')}
        recalling={recalling === 'voter'}
        onManualPass={manualPass('voter', 'Voter ID', voterStatus)}
        passing={passing === 'voter'}
        onRelease={release('voter', 'Voter ID', subject.voterResult)}
        requirements={voterReqs}
        comparison={voterCompare}
      >
        {voterManual ? (
          <ManualTile info={voterManual} />
        ) : voterErr ? (
          <ErrorTile message={voterErr} admin={admin} unresolved={unresolved(subject.voterResult)} />
        ) : voter ? (
          <GenericReadout result={voter} />
        ) : (
          <PendingTile
            label="Voter ID check"
            hint={
              voterStatus === 'unavailable'
                ? 'No Voter ID provided yet.'
                : 'Voter ID submitted — awaiting the vendor result.'
            }
          />
        )}
      </CheckCard>
      )}

      {/* 5 · Passport */}
      {PASSPORT_CHECK_ENABLED && show(passportStatus) && (
      <CheckCard
        admin={admin}
        title="Passport"
        status={passportStatus}
        order={passportStatus === 'unavailable' ? 1 : 0}
        tat={passport ? tat : undefined}
        onRecall={recall('passport')}
        recalling={recalling === 'passport'}
        onManualPass={manualPass('passport', 'Passport', passportStatus)}
        passing={passing === 'passport'}
        onRelease={release('passport', 'Passport', subject.passportResult)}
        requirements={passportReqs}
        comparison={passportCompare}
      >
        {passportManual ? (
          <ManualTile info={passportManual} />
        ) : passportErr ? (
          <ErrorTile message={passportErr} admin={admin} unresolved={unresolved(subject.passportResult)} />
        ) : passport ? (
          <GenericReadout result={passport} />
        ) : (
          <PendingTile
            label="Passport check"
            hint={
              passportStatus === 'unavailable'
                ? 'No passport file number provided yet.'
                : 'Details submitted — awaiting the vendor result.'
            }
          />
        )}
      </CheckCard>
      )}

      {/* 6 · Employment (UAN) */}
      {show(employmentStatus) && (
      <CheckCard
        admin={admin}
        title="Employment history"
        status={employmentStatus}
        order={employmentStatus === 'unavailable' ? 1 : 0}
        tat={employment ? tat : undefined}
        onRecall={recall('employment')}
        recalling={recalling === 'employment'}
        onManualPass={manualPass('employment', 'Employment', employmentStatus)}
        passing={passing === 'employment'}
        onRelease={release('employment', 'Employment', subject.employmentResult)}
        requirements={employmentReqs}
        comparison={employmentCompare}
      >
        {employmentManual ? (
          <ManualTile info={employmentManual} />
        ) : employmentErr ? (
          <ErrorTile message={employmentErr} admin={admin} unresolved={unresolved(subject.employmentResult)} />
        ) : employment ? (
          <GenericReadout result={employment} />
        ) : (
          <PendingTile
            label="Employment history check"
            hint={
              employmentStatus === 'unavailable'
                ? 'No UAN provided yet.'
                : 'UAN submitted — awaiting the vendor result.'
            }
          />
        )}
      </CheckCard>
      )}

      {/* 7 · Criminal */}
      {show(crimeStatusVal) && (
      <CheckCard
        admin={admin}
        title="Criminal records"
        status={crimeStatusVal}
        order={crimeStatusVal === 'unavailable' ? 1 : 0}
        tat={crime ? tat : undefined}
        onRecall={recall('crime')}
        recalling={recalling === 'crime'}
        onManualPass={manualPass('crime', 'Criminal records', crimeStatusVal)}
        passing={passing === 'crime'}
        onRelease={release('crime', 'Criminal records', subject.crimeResult)}
        requirements={crimeReqs}
        documents={crimeDocs}
        onPreview={setDocPreview}
      >
        {crimeManual ? (
          <ManualTile info={crimeManual} />
        ) : crimeErr ? (
          <ErrorTile message={crimeErr} admin={admin} unresolved={unresolved(subject.crimeResult)} />
        ) : crime ? (
          <CrimeReadout
            name={subject.name}
            report={crimeReport}
          />
        ) : (
          <PendingTile
            label="Criminal records check"
            hint={
              crimeStatusVal === 'unavailable'
                ? 'Needs date of birth and permanent address.'
                : crimePending
                  ? // Court records are searched manually at source, so this is
                    // the one check that legitimately sits pending overnight.
                    // Say so, or a same-day client reads it as stuck.
                    'Submitted to the court-record source. Searches are performed manually and typically return within 24-48 hours.'
                  : 'Details submitted — awaiting the result.'
            }
          />
        )}
        {/* Admin escape hatch: the automatic run skips crime when DOB, address
            or father's name never arrived. This submits the operator's own
            values instead of waiting for data that may never come. */}
        {admin && !crime && !crimeManual && !crimePending && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setCrimeSubmitError('');
                setCrimeSubmitOpen(true);
              }}
            >
              Submit with these details
            </Button>
            <span className="text-body-sm text-text-placeholder">
              Sends the details you enter straight to the court-record source.
            </span>
          </div>
        )}
      </CheckCard>
      )}

      {/* 7 · Credit score */}
      {CREDIT_CHECK_ENABLED && show(creditStatus) && (
      <CheckCard
        admin={admin}
        title="Credit score"
        status={creditStatus}
        order={creditStatus === 'unavailable' ? 1 : 0}
        tat={credit ? tat : undefined}
        onRecall={recall('credit')}
        recalling={recalling === 'credit'}
        onManualPass={manualPass('credit', 'Credit score', creditStatus)}
        passing={passing === 'credit'}
        onRelease={release('credit', 'Credit score', subject.creditResult)}
        requirements={creditReqs}
        documents={creditDocs}
        onPreview={setDocPreview}
      >
        {creditManual ? (
          <ManualTile info={creditManual} />
        ) : creditErr ? (
          <ErrorTile message={creditErr} admin={admin} unresolved={unresolved(subject.creditResult)} />
        ) : credit ? (
          creditReportUrl ? (
            <VendorReportTile
              label="Credit bureau report"
              note="The bureau returned its report as a document rather than structured fields."
              url={creditReportUrl}
            />
          ) : (
            <GenericReadout result={credit} />
          )
        ) : (
          <PendingTile
            label="Credit score check"
            hint={
              subject.creditRequestId
                ? 'Submitted to the credit bureau — the result typically arrives within 24 hours.'
                : !subject.panNumber || !subject.dob
                  ? 'Needs a PAN number and date of birth.'
                  : !creditPhone
                    ? 'The credit bureau requires a contact number for the candidate.'
                    : !creditFatherName
                      ? "The credit bureau requires the candidate's father's name — we take it from Aadhaar, PAN or the form."
                      : !creditAadhaarReady
                        ? 'Waiting on the candidate’s Aadhaar — the bureau needs the full verified address. Starts automatically once DigiLocker is done.'
                        : 'Details submitted — awaiting the credit bureau result.'
            }
          />
        )}
      </CheckCard>
      )}
        </>
      )}

      {docPreview && (
        <FilePreviewModal
          file={docPreview}
          onClose={() => setDocPreview(null)}
        />
      )}

      {manualTarget && (
        <ManualPassModal
          mode={manualTarget.mode}
          label={manualTarget.label}
          reason={manualReason}
          onReasonChange={setManualReason}
          error={manualError}
          busy={passing === manualTarget.type}
          onCancel={() => setManualTarget(null)}
          onConfirm={() => void confirmManualPass()}
        />
      )}

      {recallTarget && RECALL_FIELDS[recallTarget] && (
        <RecallModal
          type={recallTarget}
          title={RECALL_TITLES[recallTarget] ?? 'this check'}
          fields={RECALL_FIELDS[recallTarget]!}
          // Pre-filled with what was actually sent, so the operator sees the
          // value that failed rather than an empty box.
          initial={{
            panNumber: subject.panNumber ?? '',
            voterId: subject.voterId ?? '',
            passportFileNo: subject.passportFileNo ?? '',
            drivingLicense: subject.drivingLicense ?? '',
            uan: subject.uan ?? '',
            dob: subject.dob ?? '',
          }}
          error={recallError}
          busy={recalling === recallTarget}
          onCancel={() => setRecallTarget(null)}
          onConfirm={(values) => void handleRecall(recallTarget, values)}
        />
      )}

      {crimeSubmitOpen && (
        <CrimeSubmitModal
          // Pre-filled from the record, including the Aadhaar-derived address,
          // so the usual case is filling one gap rather than retyping the lot.
          initial={{
            name: subject.name ?? '',
            fatherName: resolveFatherName(subject) ?? '',
            dob: crimeDobValue ?? '',
            address: crimeAddressValue ?? '',
            panNumber: subject.panNumber ?? '',
          }}
          error={crimeSubmitError}
          busy={crimeSubmitting}
          onCancel={() => setCrimeSubmitOpen(false)}
          onConfirm={(payload) => void confirmCrimeSubmit(payload)}
        />
      )}

    </div>
  );
}

/* ---------- subcomponents ---------- */

/**
 * Confirmation panel for an admin manual override. Plain fixed overlay rather
 * than the RDS DialogBox, matching the pattern used elsewhere in this app
 * (the DialogBox enter transition doesn't fire reliably here) — styling and
 * controls are all RDS.
 */
/** Shown when the vendor's answer is a report file rather than data fields. */
function VendorReportTile({
  label,
  note,
  url,
}: {
  label: string;
  note: string;
  url: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border-default bg-neutral-100 p-4">
      <FileText className="mt-0.5 size-5 shrink-0 text-icon-default" />
      <div className="min-w-0">
        <div className="text-body-md font-medium text-text-heading">{label}</div>
        <p className="mt-0.5 text-body-sm text-text-subheading">{note}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-block text-body-sm font-medium text-text-link hover:underline"
        >
          Open the full report (PDF)
        </a>
      </div>
    </div>
  );
}

function ManualPassModal({
  mode,
  label,
  reason,
  onReasonChange,
  error,
  busy,
  onCancel,
  onConfirm,
}: {
  mode: 'passed' | 'unable';
  label: string;
  reason: string;
  onReasonChange: (v: string) => void;
  error: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Mark ${label} as passed manually`}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border-default bg-white shadow-lg"
      >
        <div className="flex items-start gap-3 border-b border-border-default px-5 py-4">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-warning text-warning">
            <ShieldCheck size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-body-lg font-semibold text-text-heading">
              {mode === 'unable'
                ? `Mark “${label}” as unable to verify`
                : `Mark “${label}” as passed manually`}
            </h2>
            <p className="mt-0.5 text-body-sm text-text-subheading">
              {mode === 'unable'
                ? 'Releases this failure to the client. Until you do, they see the check as in progress.'
                : 'Use this only when the verification source cannot return a result.'}
            </p>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-lg border border-border-warning bg-surface-warning px-4 py-3 text-body-sm text-warning-900">
            {mode === 'unable' ? (
              <>
                The client&rsquo;s report will show{' '}
                <span className="font-semibold">Unable to verify</span> — this
                check ends unverified. They never see the underlying vendor
                error.
              </>
            ) : (
              <>
                The report will show{' '}
                <span className="font-semibold">Verified manually</span> against
                your name — it will not claim the source confirmed this check.
              </>
            )}
          </div>

          <div>
            <label
              htmlFor="manual-pass-reason"
              className="mb-1.5 block text-body-sm font-medium text-text-body"
            >
              Reason{' '}
              <span className="font-normal text-text-placeholder">
                (optional, stored on the record)
              </span>
            </label>
            <Textarea
              id="manual-pass-reason"
              rows={3}
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="e.g. Passport office records not digitised; verified against the physical document."
              disabled={busy}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-border-error bg-surface-error px-4 py-2.5 text-body-sm text-failure">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-default bg-neutral-100 px-5 py-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy} isLoading={busy}>
            {mode === 'unable' ? 'Mark unable to verify' : 'Mark as passed'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Recall a check with corrected inputs.
 *
 * A failed ID check is far more often a typo than a vendor problem, so firing
 * the same wrong value again just burns another call. This pre-fills what was
 * sent, lets the operator fix it, and saves the correction to the record — the
 * report's "Required inputs" then shows what actually went to the source.
 */
function RecallModal({
  type,
  title,
  fields,
  initial,
  error,
  busy,
  onCancel,
  onConfirm,
}: {
  type: RecallType;
  title: string;
  fields: ReadonlyArray<{ key: keyof RecheckOverrides; label: string; placeholder: string }>;
  initial: RecheckOverrides;
  error: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (values: RecheckOverrides) => void;
}) {
  const [form, setForm] = useState<RecheckOverrides>(initial);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [busy, onCancel]);

  const complete = fields.every((f) => (form[f.key] ?? '').trim().length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Re-run ${title}`}
        className="w-full max-w-md overflow-hidden rounded-xl border border-border-default bg-white shadow-lg"
      >
        <div className="flex items-start gap-3 border-b border-border-default px-5 py-4">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-info text-primary">
            <RefreshCw size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-body-lg font-semibold text-text-heading">
              Re-run {title.toLowerCase()}
            </h2>
            <p className="mt-0.5 text-body-sm text-text-subheading">
              Check the details before re-sending. Edits are saved to the
              candidate.
            </p>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          {fields.map((f) => (
            <InputFieldWrapper key={String(f.key)} label={f.label} required>
              <Input
                value={form[f.key] ?? ''}
                placeholder={f.placeholder}
                disabled={busy}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
              />
            </InputFieldWrapper>
          ))}

          {error && (
            <div className="rounded-lg border border-border-error bg-surface-error px-4 py-2.5 text-body-sm text-failure">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-default bg-neutral-100 px-5 py-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(form)}
            disabled={busy || !complete}
            isLoading={busy}
          >
            {busy ? 'Re-running…' : 'Re-run check'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Admin-only: submit the crime check with fields typed by the operator.
 *
 * The automatic run skips crime entirely when DOB, address or father's name
 * never arrived — correct, because it can't invent them. This is the way in
 * when an operator has the details offline and wants the search run anyway.
 * Pre-filled with whatever the record already holds so the common case is
 * "fill the one missing field and submit".
 */
function CrimeSubmitModal({
  initial,
  error,
  busy,
  onCancel,
  onConfirm,
}: {
  initial: CrimeSubmitPayload;
  error: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (payload: CrimeSubmitPayload) => void;
}) {
  const [form, setForm] = useState<CrimeSubmitPayload>(initial);
  const set = (k: keyof CrimeSubmitPayload, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [busy, onCancel]);

  const address = (form.address ?? '').trim();
  // Mirror the vendor's own bounds so a rejection surfaces before we spend a
  // submission learning the same thing from them.
  const addressBad = address.length > 0 && address.length < 10;
  const nameOk = (form.name ?? '').trim().length >= 2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Submit criminal records check"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border-default bg-white shadow-lg"
      >
        <div className="flex items-start gap-3 border-b border-border-default px-5 py-4">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-info text-primary">
            <ShieldCheck size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-body-lg font-semibold text-text-heading">
              Submit criminal records check
            </h2>
            <p className="mt-0.5 text-body-sm text-text-subheading">
              Sends these exact details to the court-record source.
            </p>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-lg border border-border-warning bg-surface-warning px-4 py-3 text-body-sm text-warning-900">
            This bills a fresh search. Results take 24&ndash;48 hours and land on
            the report automatically.
          </div>

          <InputFieldWrapper label="Full name" required>
            <Input
              value={form.name ?? ''}
              placeholder="e.g. Nishant Kumar Vidhuri"
              onChange={(e) => set('name', e.target.value)}
              disabled={busy}
            />
          </InputFieldWrapper>

          <InputFieldWrapper label="Father's name">
            <Input
              value={form.fatherName ?? ''}
              placeholder="e.g. Rakesh Kumar Vidhuri"
              onChange={(e) => set('fatherName', e.target.value)}
              disabled={busy}
            />
          </InputFieldWrapper>

          <InputFieldWrapper label="Date of birth">
            <Input
              value={form.dob ?? ''}
              placeholder="DD-MM-YYYY"
              onChange={(e) => set('dob', e.target.value)}
              disabled={busy}
            />
          </InputFieldWrapper>

          <InputFieldWrapper
            label="Address"
            error={addressBad ? 'At least 10 characters' : undefined}
          >
            <Textarea
              rows={2}
              value={form.address ?? ''}
              placeholder="House, locality, city, state, pincode"
              onChange={(e) => set('address', e.target.value)}
              disabled={busy}
            />
          </InputFieldWrapper>

          <InputFieldWrapper label="PAN">
            <Input
              value={form.panNumber ?? ''}
              placeholder="ABCDE1234F"
              onChange={(e) => set('panNumber', e.target.value.toUpperCase())}
              disabled={busy}
            />
          </InputFieldWrapper>

          {error && (
            <div className="rounded-lg border border-border-error bg-surface-error px-4 py-2.5 text-body-sm text-failure">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-default bg-neutral-100 px-5 py-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(form)}
            disabled={busy || !nameOk || addressBad}
            isLoading={busy}
          >
            Submit check
          </Button>
        </div>
      </div>
    </div>
  );
}

function HeadField({
  label,
  value,
  pill,
}: {
  label: string;
  value?: string | null;
  /** Small status pill rendered next to the value (e.g. "Refunded"). */
  pill?: ReactNode;
}) {
  // Long values (emails) truncate to keep the card tidy; hovering shows the
  // native tooltip and tapping/clicking toggles the full value inline.
  const [expanded, setExpanded] = useState(false);
  const has = Boolean(value && value.trim());
  return (
    <div className="min-w-0">
      <div className="text-body-sm text-text-placeholder">{label}</div>
      {/* Wraps rather than truncating when a pill is present, so a short value
          like an amount never gets clipped to make room for it. */}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`text-body-md text-text-heading ${
            expanded ? 'break-words' : pill ? 'whitespace-nowrap' : 'truncate'
          }`}
          title={has ? (value as string) : undefined}
          onClick={() => has && setExpanded((x) => !x)}
        >
          {has ? value : '—'}
        </span>
        {pill}
      </div>
    </div>
  );
}

function ManualTile({
  info,
}: {
  info: { passedBy: string; passedAt: string; reason: string | null };
}) {
  const when = info.passedAt
    ? new Date(info.passedAt).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border-warning bg-surface-warning p-4">
      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-warning" />
      <div>
        <div className="text-body-md font-medium text-warning">
          Verified manually
        </div>
        <div className="mt-0.5 text-body-sm text-warning-900">
          The verification source could not return a result, so this check was
          passed by {info.passedBy}
          {when ? ` on ${when}` : ''}.
          {info.reason ? ` Reason: ${info.reason}` : ''}
        </div>
      </div>
    </div>
  );
}

/**
 * What a CLIENT is told when a check couldn't be completed. Never the raw
 * vendor text — that leaks third-party internals into a document employers
 * read and forward. Distinguishes "the source didn't answer" from "the source
 * answered, and found nothing matching", which mean different things to them.
 */
function clientErrorMessage(raw: string): string {
  const t = raw.toLowerCase();
  const systemish =
    /invalid url|no scheme|timeout|timed out|econn|network|unavailable|internal server|http 5\d\d|could not reach|failed to fetch|502|503|504/.test(
      t,
    );
  return systemish
    ? 'The verification source was temporarily unavailable, so this check could not be completed. Our team has been notified.'
    : 'No matching record was found for the details provided, so this check could not be completed.';
}

function ErrorTile({
  message,
  admin = false,
  unresolved = false,
}: {
  message: string;
  admin?: boolean;
  /** Failure still awaiting an operator decision — clients must not see it. */
  unresolved?: boolean;
}) {
  if (!admin && unresolved) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-border-default bg-primary-bg p-4">
        <Clock className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <div className="text-body-md font-medium text-text-heading">
            In progress
          </div>
          <div className="mt-0.5 text-body-sm text-text-subheading">
            Verification is underway with the source. We will update this as
            soon as the outcome is confirmed.
          </div>
        </div>
      </div>
    );
  }
  return <ErrorTileInner message={admin ? message : clientErrorMessage(message)} admin={admin} />;
}

function ErrorTileInner({ message, admin }: { message: string; admin: boolean }) {
  // Clients get a neutral amber "Unable to verify"; admins keep the red
  // "Verification failed" with the vendor's own message for diagnosis.
  const tone = admin
    ? { box: 'border-border-error bg-surface-error', text: 'text-text-error', title: 'Verification failed' }
    : { box: 'border-border-warning bg-surface-warning', text: 'text-warning-900', title: 'Unable to verify' };
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-4 ${tone.box}`}>
      <AlertTriangle className={`mt-0.5 size-5 shrink-0 ${tone.text}`} />
      <div>
        <div className={`text-body-md font-medium ${tone.text}`}>{tone.title}</div>
        <div className={`mt-0.5 text-body-sm ${tone.text}`}>{message}</div>
      </div>
    </div>
  );
}

function PendingTile({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rp-pending">
      <Hourglass size={22} className="rp-pending-ico" />
      <div>
        <div className="rp-pending-title">{label} pending</div>
        <div className="rp-pending-sub">{hint}</div>
      </div>
    </div>
  );
}

function prettyKey(k: string): string {
  return k
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Generic readout for verification results whose exact shape is vendor-specific
 * (driving licence, voter, passport, credit). Unwraps a `data` envelope if
 * present and renders the top-level primitive fields as a labelled grid.
 */
function GenericReadout({ result }: { result: Record<string, unknown> }) {
  const inner =
    result && typeof result.data === 'object' && result.data !== null
      ? (result.data as Record<string, unknown>)
      : result;
  const entries = Object.entries(inner)
    .filter(
      ([, v]) =>
        v !== null &&
        v !== '' &&
        (typeof v === 'string' ||
          typeof v === 'number' ||
          typeof v === 'boolean'),
    )
    .slice(0, 10);

  if (entries.length === 0) {
    return (
      <div className="rp-tile rp-tile-done">
        <div className="rp-tile-head">
          <span className="rp-tile-label">Verified</span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([k, v]) => (
        <div key={k}>
          <div className="text-body-sm uppercase tracking-wide text-text-subheading">
            {prettyKey(k)}
          </div>
          <div className="mt-0.5 text-body-md text-text-heading">
            {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}
          </div>
        </div>
      ))}
    </div>
  );
}

function PanReadout({ pan }: { pan: PanData }) {
  return (
    <div className="rp-readout">
      <div className="rp-readout-head">
        <div className="rp-readout-avatar">
          {(pan.full_name || '?').charAt(0).toUpperCase()}
        </div>
        <div className="rp-readout-meta">
          <div className="rp-readout-name">{pan.full_name || 'Unknown'}</div>
          <div className="rp-readout-sub">{pan.pan_number}</div>
        </div>
        <span className="rp-section-status rp-section-status-done">
          <CheckCircle2 size={11} />
          Verified
        </span>
      </div>
      <div className="rp-readout-grid">
        <Field label="Gender" value={genderLabel(pan.gender)} />
        <Field label="Date of birth" value={pan.dob} />
        {pan.email && <Field label="Email" value={pan.email} />}
        {pan.phone_number && <Field label="Phone" value={pan.phone_number} />}
      </div>
    </div>
  );
}

function AadhaarReadout({ a }: { a: AadhaarKyc }) {
  return (
    <div className="rp-readout">
      <div className="rp-readout-head">
        {a.photo ? (
          <img
            className="rp-readout-photo"
            src={`data:image/jpeg;base64,${a.photo}`}
            alt=""
          />
        ) : (
          <div className="rp-readout-avatar">
            {(a.name || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="rp-readout-meta">
          <div className="rp-readout-name">{a.name || 'Unknown'}</div>
          <div className="rp-readout-sub">{a.uidMasked || '—'}</div>
        </div>
        <span className="rp-section-status rp-section-status-done">
          <CheckCircle2 size={11} />
          Verified
        </span>
      </div>
      <div className="rp-readout-grid">
        <Field label="Date of birth" value={a.dob} />
        <Field label="Gender" value={genderLabel(a.gender)} />
      </div>
      {a.address && (
        <div className="rp-readout-block">
          <div className="rp-readout-block-label">Address</div>
          <div className="rp-readout-block-value">
            {formatAddress(a.address) || '—'}
          </div>
        </div>
      )}
    </div>
  );
}

function CrimeReadout({
  name,
  report,
}: {
  name: string;
  report: CrimeReport;
}) {
  const ra = report.risk_assessment ?? {};
  const cases = report.cases ?? [];
  const [preview, setPreview] = useState<PdfPreview | null>(null);
  const caseCount = ra.number_of_cases ?? cases.length;
  // The BGV pipeline hands back a PDF and no structured fields. With no risk
  // band and no cases array there is no verdict — showing the "0 cases found"
  // counter would assert a clean sheet the source never stated.
  const hasVerdict =
    typeof ra.risk_type === 'string' ||
    typeof ra.number_of_cases === 'number' ||
    Array.isArray(report.cases);

  return (
    <div className="rp-readout">
      <div className="rp-readout-head">
        <div className="rp-readout-avatar">
          {(name || '?').charAt(0).toUpperCase()}
        </div>
        <div className="rp-readout-meta">
          <div className="rp-readout-name">{name}</div>
          {/* The vendor's case id is internal plumbing — it means nothing to a
              client and identifies our supplier, so it stays out of the UI. */}
          <div className="rp-readout-sub">Crime check</div>
        </div>
        {ra.risk_type && (
          <span className={`rp-risk-pill ${riskClass(ra.risk_type)}`}>
            {ra.risk_type}
          </span>
        )}
      </div>

      {/* The case counter only means something when the vendor states one.
          With no verdict there is nothing to count, and the report document is
          already offered by the card's own documents section — a second set of
          preview/download buttons here was duplicate furniture. */}
      {hasVerdict && (
        <div className="rp-crime-bar">
          <div className="rp-crime-stat">
            <div className="rp-crime-stat-n">{caseCount}</div>
            <div className="rp-crime-stat-l">
              {caseCount === 1 ? 'Case found' : 'Cases found'}
            </div>
          </div>
        </div>
      )}

      {ra.risk_summary && (
        <div className="rp-readout-block">
          <div className="rp-readout-block-label">Risk summary</div>
          <div className="rp-readout-block-value">{ra.risk_summary}</div>
        </div>
      )}

      {cases.length > 0 && (
        <div className="rp-cases">
          {cases.map((c, i) => (
            <CrimeCaseCard key={i} c={c} index={i} setPreview={setPreview} />
          ))}
        </div>
      )}

      {preview && (
        <PdfPreviewModal
          url={preview.url}
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rp-field">
      <div className="rp-field-label">{label}</div>
      <div className="rp-field-value">{value || '—'}</div>
    </div>
  );
}

function CrimeCaseCard({
  c,
  index,
  setPreview,
}: {
  c: CrimeCase;
  index: number;
  setPreview: Dispatch<SetStateAction<PdfPreview | null>>;
}) {
  const isFir = Boolean(c.firNumber);
  const headLabel = isFir ? 'FIR' : c.caseType || c.caseTypeName || 'Case';
  const location = [c.district, c.state].filter(Boolean).join(', ');

  return (
    <div className="rp-case">
      <div className="rp-case-head">
        <div>
          <div className="rp-case-title">
            Case {c.slNo || index + 1} · {headLabel}
          </div>
          {c.caseStatus && <div className="rp-case-sub">{c.caseStatus}</div>}
        </div>
        <div className="rp-case-head-tags">
          {c.severity && (
            <span className={`rp-sev-chip ${severityClass(c.severity)}`}>
              <AlertTriangle size={11} />
              {c.severity}
            </span>
          )}
          {c.riskType && (
            <span
              className={`rp-risk-pill rp-risk-pill-sm ${riskClass(c.riskType)}`}
            >
              {c.riskType}
            </span>
          )}
        </div>
      </div>

      {c.riskSummary && <p className="rp-case-summary">{c.riskSummary}</p>}

      <div className="rp-case-grid">
        {c.severity && <Field label="Severity" value={c.severity} />}
        {c.courtName && <Field label="Court" value={c.courtName} />}
        {location && <Field label="Location" value={location} />}
        {c.caseTypeName && !isFir && (
          <Field label="Type" value={c.caseTypeName} />
        )}
        {c.section && <Field label="Sections" value={c.section} />}
        {c.underAct && <Field label="Under act" value={c.underAct} />}
        {c.caseStatus && <Field label="Status" value={c.caseStatus} />}
        {c.caseRegDate && <Field label="Registered" value={c.caseRegDate} />}
        {c.filingDate && c.filingDate !== c.caseRegDate && (
          <Field label="Filed" value={c.filingDate} />
        )}
        {c.hearingDate && <Field label="Next hearing" value={c.hearingDate} />}
        {c.petitioner && <Field label="Petitioner" value={c.petitioner} />}
        {c.respondent && <Field label="Respondent" value={c.respondent} />}
        {isFir && c.firNumber && (
          <Field label="FIR number" value={c.firNumber} />
        )}
        {isFir && c.firPoliceStation && (
          <Field label="Police station" value={c.firPoliceStation} />
        )}
        {c.matchSummary && (
          <Field label="Match" value={firstSentence(c.matchSummary)} />
        )}
      </div>

      {c.judgementSummary && (
        <div className="rp-readout-block">
          <div className="rp-readout-block-label">Judgement summary</div>
          <div className="rp-readout-block-value">{c.judgementSummary}</div>
        </div>
      )}

      {(c.caseDetailsLink ||
        (c.judgementLink && c.judgementLink !== 'NA') ||
        (c.firLink && c.firLink !== 'NA')) && (
        <div className="rp-case-links">
          {c.caseDetailsLink && (
            <a
              className="rp-case-link"
              href={c.caseDetailsLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              Case details ↗
            </a>
          )}
          {c.judgementLink && c.judgementLink !== 'NA' && (
            <button
              type="button"
              className="rp-case-link"
              onClick={() =>
                setPreview({
                  url: c.judgementLink as string,
                  title: `Case ${c.slNo ?? index + 1} — Judgement`,
                })
              }
            >
              Preview judgement
            </button>
          )}
          {c.firLink && c.firLink !== 'NA' && (
            <button
              type="button"
              className="rp-case-link"
              onClick={() =>
                setPreview({
                  url: c.firLink as string,
                  title: `Case ${c.slNo ?? index + 1} — FIR copy`,
                })
              }
            >
              Preview FIR
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PdfPreviewModal({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    setBlobUrl(null);
    setError(null);
    (async () => {
      try {
        const token = getToken();
        if (!token) throw new Error('Your session has expired.');
        const objectUrl = await fetchPdfBlobUrl(token, url);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        created = objectUrl;
        setBlobUrl(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  return (
    <div className="pdf-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="pdf-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="pdf-modal-head">
          <div className="pdf-modal-title">{title}</div>
          <div className="pdf-modal-actions">
            <a
              className="pdf-modal-link"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in new tab ↗
            </a>
            <button
              type="button"
              className="pdf-modal-close"
              onClick={onClose}
              aria-label="Close preview"
            >
              ×
            </button>
          </div>
        </header>
        {error ? (
          <div className="pdf-modal-empty">
            <div>Couldn&apos;t load the PDF preview.</div>
            <div className="pdf-modal-empty-sub">{error}</div>
            <a
              className="pdf-modal-link"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in a new tab instead ↗
            </a>
          </div>
        ) : !blobUrl ? (
          <div className="pdf-modal-empty">
            <div>Loading PDF…</div>
          </div>
        ) : (
          <iframe className="pdf-modal-frame" src={blobUrl} title={title} />
        )}
      </div>
    </div>
  );
}
