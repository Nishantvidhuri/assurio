import { Subject } from '../../generated/prisma/client';

// Buy-side vendor cost per check (INR), matching the active VendorCostRate card.
export const COST = {
  pan: 2.64,
  aadhaar: 3.24,
  crime: 100,
  dl: 3,
  voter: 3,
  passport: 3,
  employment: 5,
  credit: 100,
} as const;

export type BillType = keyof typeof COST;

export interface BillingEvent {
  subjectId: string;
  subjectName: string;
  type: BillType;
  label: string;
  credits: number;
  at?: Date;
}

// result field → billing type + label.
const RESULT_FIELDS: Array<[keyof Subject, BillType, string]> = [
  ['panResult', 'pan', 'PAN verification'],
  ['aadhaarResult', 'aadhaar', 'Aadhaar (DigiLocker)'],
  ['crimeResult', 'crime', 'Crime check'],
  ['dlResult', 'dl', 'Driving licence'],
  ['voterResult', 'voter', 'Voter ID'],
  ['passportResult', 'passport', 'Passport'],
  ['employmentResult', 'employment', 'Employment history'],
  ['creditResult', 'credit', 'Credit check'],
];

/**
 * Billable vendor calls for a subject. Counts from the subject's
 * `verificationLog` (one entry per real call — so recalls add up), and falls
 * back to result-presence for legacy subjects whose calls predate logging.
 */
function isCheckError(v: unknown): boolean {
  return Boolean(v && typeof v === 'object' && '__checkError' in v);
}

export function eventsForSubject(doc: Subject): BillingEvent[] {
  const log = Array.isArray(doc.verificationLog)
    ? (doc.verificationLog as Array<{ type?: string }>)
    : [];
  const list: BillingEvent[] = [];
  for (const [field, type, label] of RESULT_FIELDS) {
    const logged = log.filter((e) => e?.type === type).length;
    const value = (doc as Record<string, unknown>)[field];
    // A stored error is a failed lookup — not a billable success.
    const resultPresent = Boolean(value) && !isCheckError(value);
    const count = logged > 0 ? logged : resultPresent ? 1 : 0;
    for (let i = 0; i < count; i++) {
      list.push({
        subjectId: doc.id,
        subjectName: doc.name,
        type,
        label,
        credits: COST[type],
        at: doc.updatedAt,
      });
    }
  }
  return list;
}

export function summarizeEvents(events: BillingEvent[]) {
  const sorted = [...events].sort(
    (a, b) => (b.at ? +b.at : 0) - (a.at ? +a.at : 0),
  );
  const totalCredits = sorted.reduce((s, e) => s + e.credits, 0);
  return {
    events: sorted,
    totalCredits,
    totalAmount: totalCredits,
    byType: {
      pan: sorted.filter((e) => e.type === 'pan').length,
      aadhaar: sorted.filter((e) => e.type === 'aadhaar').length,
      crime: sorted.filter((e) => e.type === 'crime').length,
    },
  };
}
