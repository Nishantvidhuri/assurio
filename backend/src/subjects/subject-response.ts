import { Subject } from '../../generated/prisma/client';

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
    panResult: doc.panResult as Record<string, unknown> | null,
    aadhaarResult: doc.aadhaarResult as Record<string, unknown> | null,
    digilockerClientId: doc.digilockerClientId,
    digilockerUrl: doc.digilockerUrl,
    crimeRequestId: doc.crimeRequestId,
    crimeResult: doc.crimeResult as Record<string, unknown> | null,
    consentResult: doc.consentResult as Record<string, unknown> | null,
    verificationLog: (doc.verificationLog ?? []) as Array<{
      type: 'pan' | 'aadhaar' | 'crime';
      calledAt: string;
      result: Record<string, unknown>;
    }>,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
