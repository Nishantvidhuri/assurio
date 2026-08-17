import type { S3Service } from '../common/s3.service';

/**
 * Resolve a subject's stored document images (S3 keys after the durable-upload
 * port, or legacy base64) into browser/PDF-loadable URLs for the report.
 * Returns a shallow copy with the four image fields + the consent signature
 * presigned. Shared by the on-demand report endpoint and the background
 * report-generation job.
 */
export async function resolveReportImages<
  T extends {
    panFront?: string | null;
    panBack?: string | null;
    aadhaarFront?: string | null;
    aadhaarBack?: string | null;
    consentResult?: unknown;
  },
>(s3: S3Service, subject: T): Promise<T> {
  const [panFront, panBack, aadhaarFront, aadhaarBack] = await Promise.all([
    s3.resolveViewableUrl(subject.panFront),
    s3.resolveViewableUrl(subject.panBack),
    s3.resolveViewableUrl(subject.aadhaarFront),
    s3.resolveViewableUrl(subject.aadhaarBack),
  ]);
  const consent = subject.consentResult as Record<string, unknown> | null;
  let consentResult = subject.consentResult;
  if (consent && typeof consent.signatureImage === 'string') {
    consentResult = {
      ...consent,
      signatureImage: await s3.resolveViewableUrl(consent.signatureImage as string),
    };
  }
  return { ...subject, panFront, panBack, aadhaarFront, aadhaarBack, consentResult };
}
