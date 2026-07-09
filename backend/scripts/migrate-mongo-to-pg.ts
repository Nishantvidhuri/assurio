/**
 * One-shot migration: MongoDB → PostgreSQL (idempotent via upsert).
 * Run with: npx ts-node scripts/migrate-mongo-to-pg.ts
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bg-check';
const DATABASE_URL = process.env.DATABASE_URL!;

async function main() {
  console.log('Connecting to MongoDB...');
  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();
  const db = mongo.db();

  console.log('Connecting to PostgreSQL...');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DATABASE_URL }),
  });

  try {
    // ── 1. Users ──────────────────────────────────────────────────────────────
    const users = await db.collection('users').find().toArray();
    console.log(`\nMigrating ${users.length} users...`);
    for (const u of users) {
      const id = u._id.toString();
      await prisma.user.upsert({
        where: { id },
        create: {
          id,
          email: u.email,
          name: u.name,
          passwordHash: u.passwordHash,
          role: u.role ?? 'owner',
          phone: u.phone ?? null,
          resetToken: u.resetToken ?? null,
          resetTokenExpiresAt: u.resetTokenExpiresAt ?? null,
          createdAt: u.createdAt ?? new Date(),
        },
        update: {},
      });
      process.stdout.write('.');
    }
    console.log(' done');

    // ── 2. Subjects ───────────────────────────────────────────────────────────
    const subjects = await db.collection('subjects').find().toArray();
    console.log(`\nMigrating ${subjects.length} subjects...`);
    for (const s of subjects) {
      const id = s._id.toString();
      await prisma.subject.upsert({
        where: { id },
        create: {
          id,
          userId: s.userId,
          name: s.name,
          role: s.role ?? '',
          email: s.email ?? '',
          phone: s.phone ?? '',
          inviteToken: s.inviteToken ?? null,
          status: s.status ?? 'invited',
          passwordHash: s.passwordHash ?? null,
          panFront: s.panFront ?? null,
          panBack: s.panBack ?? null,
          panNumber: s.panNumber ?? null,
          aadhaarFront: s.aadhaarFront ?? null,
          aadhaarBack: s.aadhaarBack ?? null,
          aadhaarNumber: s.aadhaarNumber ?? null,
          panResult: s.panResult ?? null,
          aadhaarResult: s.aadhaarResult ?? null,
          digilockerClientId: s.digilockerClientId ?? null,
          digilockerUrl: s.digilockerUrl ?? null,
          crimeRequestId: s.crimeRequestId ?? null,
          crimeResult: s.crimeResult ?? null,
          consentResult: s.consentResult ?? null,
          verificationLog: (s.verificationLog ?? []) as any,
          resetToken: s.resetToken ?? null,
          resetTokenExpiresAt: s.resetTokenExpiresAt ?? null,
          createdAt: s.createdAt ?? new Date(),
          updatedAt: s.updatedAt ?? new Date(),
        },
        update: {},
      });
      process.stdout.write('.');
    }
    console.log(' done');

    // ── 3. Invoices ───────────────────────────────────────────────────────────
    // Build email → subjectId lookup so we can populate the FK
    const subjectByEmail = new Map<string, string>();
    for (const s of subjects) {
      if (s.email) subjectByEmail.set((s.email as string).toLowerCase(), s._id.toString());
    }

    const invoices = await db.collection('invoices').find().toArray();
    console.log(`\nMigrating ${invoices.length} invoices...`);
    for (const inv of invoices) {
      const id = inv._id.toString();
      const subjectId = inv.customerEmail
        ? (subjectByEmail.get((inv.customerEmail as string).toLowerCase()) ?? null)
        : null;

      await prisma.invoice.upsert({
        where: { id },
        create: {
          id,
          invoiceNumber: inv.invoiceNumber,
          userId: inv.userId,
          subjectId,
          customerName: inv.customerName,
          customerEmail: inv.customerEmail ?? '',
          customerPhone: inv.customerPhone ?? null,
          lineItems: (inv.lineItems ?? []) as any,
          subtotal: Number(inv.subtotal),
          tax: Number(inv.tax),
          total: Number(inv.total),
          taxRatePercent: Number(inv.taxRatePercent ?? 18),
          currency: inv.currency ?? 'INR',
          status: inv.status ?? 'paid',
          razorpayPaymentId: inv.razorpayPaymentId,
          razorpayPaymentLinkId: inv.razorpayPaymentLinkId ?? null,
          razorpayPaymentLinkReferenceId: inv.razorpayPaymentLinkReferenceId ?? null,
          paidAt: inv.paidAt ?? null,
          pdfS3Key: inv.pdfS3Key ?? null,
          notes: inv.notes ?? null,
          createdAt: inv.createdAt ?? new Date(),
          updatedAt: inv.updatedAt ?? new Date(),
        },
        update: {},
      });
      process.stdout.write('.');
    }
    console.log(' done');

    // ── 4. Outbox events ──────────────────────────────────────────────────────
    const outboxEvents = await db.collection('outbox_events').find().toArray();
    console.log(`\nMigrating ${outboxEvents.length} outbox events...`);
    for (const ev of outboxEvents) {
      const id = ev._id.toString();
      await prisma.outboxEvent.upsert({
        where: { id },
        create: {
          id,
          eventType: ev.eventType,
          payload: ev.payload as any,
          status: ev.status ?? 'pending',
          attempts: ev.attempts ?? 0,
          maxAttempts: ev.maxAttempts ?? 5,
          processAfter: ev.processAfter ?? new Date(),
          processedAt: ev.processedAt ?? null,
          lastError: ev.lastError ?? null,
          idempotencyKey: ev.idempotencyKey ?? null,
          createdAt: ev.createdAt ?? new Date(),
          updatedAt: ev.updatedAt ?? new Date(),
        },
        update: {},
      });
      process.stdout.write('.');
    }
    console.log(' done');

    // ── 5. Bulk batches ───────────────────────────────────────────────────────
    const bulkBatches = await db.collection('bulk_batches').find().toArray();
    console.log(`\nMigrating ${bulkBatches.length} bulk batches...`);
    for (const b of bulkBatches) {
      const id = b._id.toString();
      await prisma.bulkBatch.upsert({
        where: { batchId: b.batchId },
        create: {
          id,
          batchId: b.batchId,
          userId: b.userId,
          total: b.total,
          done: b.done ?? 0,
          failed: b.failed ?? 0,
          status: b.status ?? 'done',
          failedRows: (b.failedRows ?? []) as any,
          createdAt: b.createdAt ?? new Date(),
          updatedAt: b.updatedAt ?? new Date(),
        },
        update: {},
      });
      process.stdout.write('.');
    }
    console.log(' done');

    // ── Summary ───────────────────────────────────────────────────────────────
    const [pgUsers, pgSubjects, pgInvoices, pgOutbox, pgBatches] = await Promise.all([
      prisma.user.count(),
      prisma.subject.count(),
      prisma.invoice.count(),
      prisma.outboxEvent.count(),
      prisma.bulkBatch.count(),
    ]);

    console.log('\n✓ Migration complete');
    console.log(`  users:          ${pgUsers}`);
    console.log(`  subjects:       ${pgSubjects}`);
    console.log(`  invoices:       ${pgInvoices}`);
    console.log(`  outbox_events:  ${pgOutbox}`);
    console.log(`  bulk_batches:   ${pgBatches}`);

  } finally {
    await mongo.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
