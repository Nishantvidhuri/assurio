import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { VendorBalanceService } from '../src/modules/internal/vendors/vendor-balance.service';

/**
 * Fetches each syncable prepaid vendor's live balance and writes the snapshot +
 * reading, using the real VendorBalanceService. Handy for a manual refresh or a
 * cron; the app also refreshes on dashboard load and via
 * POST /v1/internal/vendors/balances/refresh.
 *
 * Run: npx ts-node scripts/sync-vendor-balances.ts
 */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const service = new VendorBalanceService(prisma as never);
    const results = await service.syncBalances();
    for (const r of results) {
      console.log(
        r.ok
          ? `✓ ${r.vendor}: balance ${r.balance}`
          : `✗ ${r.vendor}: ${r.error}`,
      );
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Balance sync failed:', error);
  process.exit(1);
});
