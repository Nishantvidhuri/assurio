import { Subject } from '../../generated/prisma/client';
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
export function computeSubjectProgress(d: Subject): {
  done: number;
  total: number;
} {
  const has = (v: unknown) => Boolean(v);

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

  // [applicable, done] per check.
  const checks: Array<[boolean, boolean]> = [
    [has(d.panNumber), has(d.panResult)], // PAN
    [has(d.digilockerClientId || d.aadhaarNumber), has(d.aadhaarResult)], // Aadhaar
    [has(d.drivingLicense) && has(d.dob), has(d.dlResult)], // Driving Licence
    [has(d.voterId), has(d.voterResult)], // Voter ID
    [has(d.passportFileNo) && has(d.dob), has(d.passportResult)], // Passport
    [has(d.uan), has(d.employmentResult)], // Employment
    [
      has(d.name) && dobKnown && crimeAddressKnown && fatherKnown,
      has(d.crimeResult),
    ], // Criminal
    [
      has(d.panNumber) &&
        dobKnown &&
        creditAddressKnown &&
        fatherKnown &&
        phoneKnown,
      has(d.creditResult),
    ], // Credit
  ];
  const applicable = checks.filter(([a]) => a);
  return {
    total: applicable.length,
    done: applicable.filter(([, done]) => done).length,
  };
}
