import { Subject } from '../../generated/prisma/client';

export const COST = {
  pan: 3,
  aadhaar: 3,
  crime: 100,
} as const;

export interface BillingEvent {
  subjectId: string;
  subjectName: string;
  type: 'pan' | 'aadhaar' | 'crime';
  label: string;
  credits: number;
  at?: Date;
}

export function eventsForSubject(doc: Subject): BillingEvent[] {
  const id = doc.id;
  const at = doc.updatedAt;
  const list: BillingEvent[] = [];
  if (doc.panResult) {
    list.push({ subjectId: id, subjectName: doc.name, type: 'pan', label: 'PAN verification', credits: COST.pan, at });
  }
  if (doc.aadhaarResult) {
    list.push({ subjectId: id, subjectName: doc.name, type: 'aadhaar', label: 'Aadhaar (DigiLocker)', credits: COST.aadhaar, at });
  }
  if (doc.crimeResult) {
    list.push({ subjectId: id, subjectName: doc.name, type: 'crime', label: 'Crime check', credits: COST.crime, at });
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
