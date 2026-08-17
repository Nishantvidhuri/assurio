import { Subject } from '../../generated/prisma/client';
import { computeSubjectProgress } from './subject-progress';

/** Serialises a Subject for the API — never exposes passwordHash. */
export function toSubjectResponse(doc: Subject) {
  const baseUrl =
    process.env.PUBLIC_APP_URL?.replace(/\/$/, '') ||
    process.env.APP_URL ||
    'http://localhost:3000';
  return {
    id: doc.id,
    name: doc.name,
    role: doc.role,
    email: doc.email,
    phone: doc.phone,
    status: doc.status,
    inviteToken: doc.inviteToken,
    inviteUrl: doc.inviteToken ? `${baseUrl}/invite/${doc.inviteToken}` : null,
    panFront: doc.panFront,
    panBack: doc.panBack,
    panNumber: doc.panNumber,
    aadhaarFront: doc.aadhaarFront,
    aadhaarBack: doc.aadhaarBack,
    aadhaarNumber: doc.aadhaarNumber,
    dob: doc.dob,
    permanentAddress: doc.permanentAddress,
    drivingLicense: doc.drivingLicense,
    voterId: doc.voterId,
    passportFileNo: doc.passportFileNo,
    uan: doc.uan,
    panResult: doc.panResult as Record<string, unknown> | null,
    aadhaarResult: doc.aadhaarResult as Record<string, unknown> | null,
    voterResult: doc.voterResult as Record<string, unknown> | null,
    passportResult: doc.passportResult as Record<string, unknown> | null,
    dlResult: doc.dlResult as Record<string, unknown> | null,
    employmentResult: doc.employmentResult as Record<string, unknown> | null,
    creditResult: doc.creditResult as Record<string, unknown> | null,
    digilockerClientId: doc.digilockerClientId,
    digilockerUrl: doc.digilockerUrl,
    crimeRequestId: doc.crimeRequestId,
    // Needed by the report/UI to explain the credit check's real state:
    // fatherName + a verified Aadhaar address are what the bureau requires,
    // and creditRequestId means the case is already open with them.
    creditRequestId: doc.creditRequestId,
    fatherName: doc.fatherName,
    crimeResult: doc.crimeResult as Record<string, unknown> | null,
    consentResult: doc.consentResult as Record<string, unknown> | null,
    consentAcceptedAt: doc.consentAcceptedAt,
    consentStatus: doc.consentStatus,
    consentDecidedAt: doc.consentDecidedAt,
    verificationLog: (doc.verificationLog ?? []) as Array<{
      type: 'pan' | 'aadhaar' | 'crime';
      calledAt: string;
      result: Record<string, unknown>;
    }>,
    // Real progress across all applicable checks (done/total) — used by the
    // candidates table so it matches the report (e.g. 5/7, not 2/3).
    progress: computeSubjectProgress(doc),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
