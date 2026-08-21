/**
 * Empties the database and restores only the admin login.
 *
 * TRUNCATEs every table in the public schema except Prisma's migration ledger,
 * then re-seeds the admin from ADMIN_EMAIL / ADMIN_PASSWORD. Everything else —
 * candidates, reports, invoices, wallets, vendor call audits, client accounts,
 * packages, discount codes — is gone, with no backup taken.
 *
 * Guards, because this is irreversible:
 *  • refuses to run without --yes-wipe-everything
 *  • prints the target host and row counts, then waits 5 seconds
 *  • truncates inside one transaction, so a dropped connection rolls back
 *    rather than leaving the database half-empty
 *
 * Run on the server (not through an SSH tunnel):
 *   npx ts-node scripts/wipe-db.ts --yes-wipe-everything
 */
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/** Prisma's own bookkeeping — truncating it would strand every migration. */
const KEEP_TABLES = new Set(['_prisma_migrations']);

async function main() {
  if (!process.argv.includes('--yes-wipe-everything')) {
    console.error(
      'Refusing to run. This deletes ALL data and takes no backup.\n' +
        'Re-run with:  npx ts-node scripts/wipe-db.ts --yes-wipe-everything',
    );
    process.exitCode = 1;
    return;
  }

  const url = process.env.DATABASE_URL || '';
  const pool = new Pool({ connectionString: url });

  try {
    const where = await pool.query(
      'select current_database() db, inet_server_addr()::text host, inet_server_port() port',
    );
    console.log(
      `target: ${where.rows[0].db} @ ${where.rows[0].host ?? 'local'}:${where.rows[0].port}`,
    );

    const { rows: tables } = await pool.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    );
    const targets = tables
      .map((t) => t.tablename)
      .filter((t) => !KEEP_TABLES.has(t));

    console.log('\nabout to delete:');
    let total = 0;
    for (const t of targets) {
      const r = await pool.query(`select count(*)::int c from "${t}"`);
      const c = r.rows[0].c as number;
      total += c;
      if (c > 0) console.log(`  ${t.padEnd(28)} ${c}`);
    }
    console.log(`\n${targets.length} tables · ${total} rows · NO BACKUP`);
    console.log('Ctrl-C within 5 seconds to abort…');
    await new Promise((r) => setTimeout(r, 5000));

    // One transaction: a dropped connection rolls the whole thing back rather
    // than leaving some tables emptied and others intact.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const list = targets.map((t) => `"${t}"`).join(', ');
      await client.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
      await client.query('COMMIT');
      console.log(`\n✓ Truncated ${targets.length} tables.`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  // Restore the one thing we keep: the admin login.
  const email = (process.env.ADMIN_EMAIL || 'admin@recrify.in')
    .toLowerCase()
    .trim();
  const password = process.env.ADMIN_PASSWORD || 'recrify-admin';
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    await prisma.user.create({
      data: {
        name: 'Recrify Admin',
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: 'admin',
      },
    });
    console.log(`✓ Admin restored: ${email}`);
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    '\nNothing else remains. Before checkout works again you need to re-seed\n' +
      'Package / DiscountCode and create a client account.',
  );
}

main().catch((err) => {
  console.error('Wipe failed:', err);
  process.exit(1);
});
