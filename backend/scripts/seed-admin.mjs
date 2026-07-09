/**
 * Creates (or updates) the Assurio admin account.
 * Run once:  npm run seed:admin
 * Reads ADMIN_EMAIL / ADMIN_PASSWORD / MONGODB_URI from backend/.env
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bg-check';
const email = (process.env.ADMIN_EMAIL || 'admin@assurio.com')
  .toLowerCase()
  .trim();
const password = process.env.ADMIN_PASSWORD || 'assurio-admin';

const run = async () => {
  await mongoose.connect(uri);
  const users = mongoose.connection.collection('users');
  const passwordHash = await bcrypt.hash(password, 10);

  const res = await users.updateOne(
    { email },
    {
      $set: { name: 'Assurio Admin', email, passwordHash, role: 'admin' },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );

  console.log(res.upsertedCount ? '✓ Admin account created.' : '✓ Admin account updated.');
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  await mongoose.connection.close();
};

run().catch((err) => {
  console.error('Failed to seed admin:', err);
  process.exit(1);
});
