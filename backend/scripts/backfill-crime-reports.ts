import 'dotenv/config';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { S3Service } from '../src/common/s3.service';

/**
 * Backfills court-record PDFs that were stored as the vendor's own URL.
 *
 * Crime results recorded before the archive step kept KonnectNxt's Google Cloud
 * Storage link in `crimeResult.data`. That object is public — anyone holding the
 * link reads a named person's criminal-record report with no authentication —
 * we cannot expire it, and it names our supplier. This copies each one into our
 * bucket, sets crimeReportS3Key, and rewrites the result so the URL is gone.
 *
 * Safe to re-run: subjects that already have crimeReportS3Key are skipped, and a
 * subject whose PDF can't be fetched is left exactly as it was for the next run.
 *
 * Run:        npx ts-node scripts/backfill-crime-reports.ts
 * Dry run:    npx ts-node scripts/backfill-crime-reports.ts --dry-run
 */

const MAX_PDF_BYTES = 25 * 1024 * 1024;

/** The vendor URL hiding in an old result, wherever it was stored. */
function extractUrl(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const isUrl = (v: unknown): v is string =>
    typeof v === 'string' && /^https?:\/\//i.test(v.trim());
  const o = result as Record<string, unknown>;
  if (isUrl(o.data)) return o.data.trim();
  const inner = (o.data && typeof o.data === 'object' ? o.data : o) as Record<
    string,
    unknown
  >;
  for (const k of ['download_link', 'downloadLink', 'report_url', 'reportUrl', 'pdf_url', 'url']) {
    if (isUrl(inner[k])) return (inner[k] as string).trim();
    if (isUrl(o[k])) return (o[k] as string).trim();
  }
  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const s3 = new S3Service();

  if (!s3.isConfigured) {
    console.error('S3 is not configured — set AWS_S3_BUCKET / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.');
    process.exitCode = 1;
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  try {
    const subjects = await prisma.subject.findMany({
      // DbNull, not JsonNull — an unset Json column is SQL NULL.
      where: {
        crimeReportS3Key: null,
        NOT: { crimeResult: { equals: Prisma.DbNull } },
      },
      select: { id: true, name: true, crimeRequestId: true, crimeResult: true },
    });

    let archived = 0;
    let skipped = 0;
    let failed = 0;

    for (const s of subjects) {
      const url = extractUrl(s.crimeResult);
      if (!url) {
        // A failure marker, a manual override, or an already-clean result.
        skipped += 1;
        continue;
      }
      if (dryRun) {
        console.log(`WOULD ARCHIVE ${s.id} (${s.name}) <- ${url.slice(0, 90)}…`);
        archived += 1;
        continue;
      }
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`FAIL ${s.id}: HTTP ${res.status}`);
          failed += 1;
          continue;
        }
        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_PDF_BYTES) {
          console.warn(`FAIL ${s.id}: ${bytes.byteLength} bytes is outside the accepted range`);
          failed += 1;
          continue;
        }
        const caseId = s.crimeRequestId || 'legacy';
        const key = `crime-reports/${s.id}/${caseId}.pdf`;
        await s3.upload(key, bytes, 'application/pdf');

        // Preserve any structured verdict the old result carried; only the URL
        // is dropped. A result that was nothing but the URL becomes a stored
        // marker, which is what the readouts already expect.
        const previous = s.crimeResult as Record<string, unknown> | null;
        const inner =
          previous && typeof previous.data === 'object' && previous.data
            ? (previous.data as Record<string, unknown>)
            : {};
        const { download_link, downloadLink, report_url, reportUrl, pdf_url, url: _u, ...keep } = inner;
        void download_link; void downloadLink; void report_url;
        void reportUrl; void pdf_url; void _u;

        await prisma.subject.update({
          where: { id: s.id },
          data: {
            crimeReportS3Key: key,
            crimeResult: {
              ...(previous ?? {}),
              data: { ...keep, storedAt: new Date().toISOString() },
            },
          },
        });
        console.log(`OK   ${s.id} (${s.name}) -> ${key} [${bytes.byteLength} bytes]`);
        archived += 1;
      } catch (e) {
        console.warn(`FAIL ${s.id}: ${e instanceof Error ? e.message : e}`);
        failed += 1;
      }
    }

    console.log(
      `\n${dryRun ? '[dry run] ' : ''}candidates examined: ${subjects.length} · archived: ${archived} · nothing to do: ${skipped} · failed: ${failed}`,
    );
    if (failed > 0) {
      console.log('Failed ones keep their existing result — re-run to retry them.');
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main();
