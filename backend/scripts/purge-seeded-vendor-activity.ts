import 'dotenv/config';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/**
 * One-time cleanup: removes the fabricated vendor activity produced by the
 * (now deleted) scripts/seed-vendor-activity.ts so the Vendor Management
 * dashboards start blank and populate only from real platform usage.
 *
 * Scope is limited to seed-marked rows — the vendor registry, capabilities and
 * cost rate card (real config) are left untouched:
 *   • VendorApiCallAudit    — requestId starts with "seed-" OR requestPayload.seeded = true
 *   • VendorBalanceReading  — source = "seed"
 *   • VendorBalanceSnapshot — source = "seed": reported values reset to null (row kept)
 *
 * Idempotent and safe to run repeatedly.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const seededAuditWhere: Prisma.VendorApiCallAuditWhereInput = {
    OR: [
      { requestId: { startsWith: 'seed-' } },
      { requestPayload: { path: ['seeded'], equals: true } },
    ],
  };

  try {
    const [auditBefore, readingsBefore, snapshotsSeeded, auditTotalBefore] =
      await Promise.all([
        prisma.vendorApiCallAudit.count({ where: seededAuditWhere }),
        prisma.vendorBalanceReading.count({ where: { source: 'seed' } }),
        prisma.vendorBalanceSnapshot.count({ where: { source: 'seed' } }),
        prisma.vendorApiCallAudit.count(),
      ]);

    console.log('Before:');
    console.log(`  audit rows total:        ${auditTotalBefore}`);
    console.log(`  audit rows seeded:       ${auditBefore}`);
    console.log(`  balance readings seeded: ${readingsBefore}`);
    console.log(`  balance snapshots seeded:${snapshotsSeeded}`);

    const deletedAudit = await prisma.vendorApiCallAudit.deleteMany({
      where: seededAuditWhere,
    });
    const deletedReadings = await prisma.vendorBalanceReading.deleteMany({
      where: { source: 'seed' },
    });
    const resetSnapshots = await prisma.vendorBalanceSnapshot.updateMany({
      where: { source: 'seed' },
      data: {
        reportedBalance: null,
        reportedUnit: null,
        reportedCurrency: null,
        reportedAt: null,
        source: null,
      },
    });

    const auditTotalAfter = await prisma.vendorApiCallAudit.count();

    console.log('\nPurged:');
    console.log(`  audit rows deleted:      ${deletedAudit.count}`);
    console.log(`  balance readings deleted:${deletedReadings.count}`);
    console.log(`  balance snapshots reset: ${resetSnapshots.count}`);
    console.log(`\nAfter: audit rows total: ${auditTotalAfter}`);
    console.log('✓ Seeded vendor activity purged. Dashboards now derive from real usage only.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Purge failed:', error);
  process.exit(1);
});
