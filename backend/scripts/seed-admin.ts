/**
 * Creates (or updates) the Recrify admin account in PostgreSQL.
 * Run:  npm run seed:admin
 * Reads ADMIN_EMAIL / ADMIN_PASSWORD / DATABASE_URL from backend/.env
 */
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const email = (process.env.ADMIN_EMAIL || 'admin@recrify.in')
  .toLowerCase()
  .trim();
const password = process.env.ADMIN_PASSWORD || 'recrify-admin';

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const existing = await prisma.user.findUnique({ where: { email } });

    await prisma.user.upsert({
      where: { email },
      create: { name: 'Recrify Admin', email, passwordHash, role: 'admin' },
      update: { name: 'Recrify Admin', passwordHash, role: 'admin' },
    });

    console.log(existing ? '✓ Admin account updated.' : '✓ Admin account created.');
    console.log(`  email:    ${email}`);
    console.log(`  password: ${password}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Failed to seed admin:', err);
  process.exit(1);
});
