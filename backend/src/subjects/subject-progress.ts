import { Subject } from '../../generated/prisma/client';
import { isTerminal } from './check-result';
import {
  CREDIT_CHECK_ENABLED,
  PASSPORT_CHECK_ENABLED,
} from '../common/feature-flags';
import {
  aadhaarAddressOf,
  aadhaarKycOf,
  buildBgvAddress,
  formatAddressLine,
  isCompleteStructuredAddress,
  normalizePhone,
  resolveFatherName,
} from './bgv-address';

/**
 * Verification progress across ALL applicable checks — the single source of
 * truth shared by the candidates list, the report, and the "is it 100% done?"
 * gate that delivers the finished PDF.
 *
 * A check is *applicable* only when it will genuinely run: the candidate
 * provided (or Aadhaar will supply) every input the vendor demands. Checks the
 * engine can never call — employment with no UAN, credit with no father's name
 * — are excluded entirely, so they can't hold the report at 6/7 forever.
 *
 * *Done* means a stored result, success or failure — both are terminal.
 *
 * These rules mirror SubjectVerificationService.run() exactly; if a gate
 * changes there, change it here too or reports will hang.
 */
export interface CheckApplicability {
  key: string;
  label: string;
  applicable: boolean;
  done: boolean;
}

/**
 * Per-check applicability + doneness. The ONE place that decides whether a
 * check will run, so the consent page's promise, the progress ratio and the
 * engine can never drift apart — they all read this.
 */
export function checkApplicability(d: Subject): CheckApplicability[] {
  const has = (v: unknown) => Boolean(v);
  // A check is DONE only once its result is terminal. An unresolved vendor
  // failure ({ __checkError } awaiting an operator decision) is deliberately
  // NOT done: the client sees it as in progress and the verification must not
  // complete or ship a report until the failure is passed or released.
  const done = (v: unknown) => isTerminal(v);

  // While DigiLocker is still expected, treat what it supplies (address, DOB,
  // father's name via care-of) as "on the way" — the check is applicable and
  // simply not done yet. Once Aadhaar lands or fails, this resolves to the
  // real answer, so a check that can never run drops out of the total.
  // Any stored aadhaarResult is terminal — a `{ __checkError }` failure settles
  // the question just as firmly as a success. Only an Aadhaar with no result at
  // all is still "on the way"; otherwise a failed DigiLocker would keep crime
  // and credit applicable forever and the report could never complete.
  const kyc = aadhaarKycOf(d.aadhaarResult);
  const aadhaarMayArrive =
    !has(d.aadhaarResult) && has(d.digilockerClientId || d.aadhaarNumber);

  const dobKnown = has(d.dob) || has(kyc?.dob) || aadhaarMayArrive;
  const fatherKnown = has(resolveFatherName(d)) || aadhaarMayArrive;
  const phoneKnown = has(normalizePhone(d.phone || ''));

  // Crime takes free text; credit needs the full structured address the bureau
  // demands, which only a verified Aadhaar can produce.
  const crimeAddress =
    (d.permanentAddress || '').trim() ||
    formatAddressLine(
      buildBgvAddress(aadhaarAddressOf(d.aadhaarResult), '', 'Permanent'),
    );
  const crimeAddressKnown = has(crimeAddress) || aadhaarMayArrive;
  const creditAddressKnown =
    isCompleteStructuredAddress(
      buildBgvAddress(aadhaarAddressOf(d.aadhaarResult), d.permanentAddress || ''),
    ) || aadhaarMayArrive;

  return [
    {
      key: 'aadhaar',
      label: 'Aadhaar (via DigiLocker)',
      applicable: has(d.digilockerClientId || d.aadhaarNumber),
      done: done(d.aadhaarResult),
    },
    {
      key: 'pan',
      label: 'PAN verification',
      applicable: has(d.panNumber),
      done: done(d.panResult),
    },
    {
      key: 'dl',
      label: 'Driving licence verification',
      applicable: has(d.drivingLicense) && has(d.dob),
      done: done(d.dlResult),
    },
    {
      key: 'voter',
      label: 'Voter ID verification',
      applicable: has(d.voterId),
      done: done(d.voterResult),
    },
    {
      key: 'passport',
      label: 'Passport verification',
      applicable:
        PASSPORT_CHECK_ENABLED && has(d.passportFileNo) && has(d.dob),
      done: done(d.passportResult),
    },
    {
      key: 'employment',
      label: 'Employment history (UAN)',
      applicable: has(d.uan),
      done: done(d.employmentResult),
    },
    {
      key: 'crime',
      label: 'Court & criminal records',
      // Needs an address and a father's name, not just a name and DOB — with
      // neither a typed address nor an Aadhaar to supply one, it cannot run.
      applicable:
        has(d.name) && dobKnown && crimeAddressKnown && fatherKnown,
      done: done(d.crimeResult),
    },
    {
      key: 'credit',
      label: 'Credit report',
      applicable:
        CREDIT_CHECK_ENABLED &&
        has(d.panNumber) &&
        dobKnown &&
        creditAddressKnown &&
        fatherKnown &&
        phoneKnown,
      done: done(d.creditResult),
    },
  ];
}

/** Progress across every check that will actually run. */
export function computeSubjectProgress(d: Subject): {
  done: number;
  total: number;
} {
  const applicable = checkApplicability(d).filter((c) => c.applicable);
  return {
    total: applicable.length,
    done: applicable.filter((c) => c.done).length,
  };
}
