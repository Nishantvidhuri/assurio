/**
 * Seeds demo fixture data (owner + candidates with completed checks) so the
 * real UI renders with realistic content — used for landing-page screenshots
 * and local demos. Idempotent: re-running updates the same fixtures.
 *
 * Run:  npx ts-node scripts/seed-demo.ts
 * Demo logins (fixtures only, created by this script):
 *   owner:     demo@assurio.test / assurio-demo
 *   candidate: sunita+demo@assurio.test / assurio-demo
 */
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const PASSWORD = 'assurio-demo';

/** Tiny neutral placeholder "document photo" (SVG data URL). */
function docImage(label: string, tint: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='400'>
    <rect width='100%' height='100%' rx='16' fill='${tint}'/>
    <rect x='24' y='24' width='140' height='140' rx='12' fill='#ffffff' opacity='0.8'/>
    <rect x='190' y='40' width='300' height='22' rx='6' fill='#ffffff' opacity='0.9'/>
    <rect x='190' y='78' width='220' height='16' rx='6' fill='#ffffff' opacity='0.7'/>
    <rect x='190' y='108' width='260' height='16' rx='6' fill='#ffffff' opacity='0.7'/>
    <rect x='24' y='200' width='592' height='14' rx='6' fill='#ffffff' opacity='0.6'/>
    <rect x='24' y='228' width='540' height='14' rx='6' fill='#ffffff' opacity='0.6'/>
    <text x='24' y='372' font-family='sans-serif' font-size='28' fill='#ffffff'>${label}</text>
  </svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

const panResult = {
  pan_number: 'FZLPD8531K',
  full_name: 'Sunita Devi',
  gender: 'F',
  dob: '1992-08-14',
  category: 'Individual',
  aadhaar_linked: true,
  dob_verified: true,
  masked_aadhaar: 'XXXX-XXXX-5678',
  email: 'sunita+demo@assurio.test',
  phone_number: '+91 98765 43210',
  address: {
    line_1: 'Flat 12B, HSR Layout',
    street_name: '27th Main Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    full: 'Flat 12B, HSR Layout, 27th Main Road, Bengaluru, Karnataka, 560102',
  },
};

const aadhaarResult = {
  uidMasked: 'XXXX XXXX 5678',
  name: 'Sunita Devi',
  dob: '1992-08-14',
  gender: 'F',
  photo: null,
  address: {
    careOf: null,
    country: 'India',
    district: 'Bengaluru Urban',
    house: 'Flat 12B',
    locality: 'HSR Layout',
    pincode: '560102',
    postOffice: 'HSR Layout',
    state: 'Karnataka',
    vtc: 'Bengaluru',
  },
};

const crimeResult = {
  data: {
    status: 'completed',
    request_id: 'REQ-20451',
    risk_assessment: {
      risk_type: 'No Risk',
      risk_summary:
        'No criminal records or adverse signals found across court and FIR databases.',
      number_of_cases: 0,
    },
    cases: [],
  },
};

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    // ── Demo owner ──
    const owner = await prisma.user.upsert({
      where: { email: 'demo@assurio.test' },
      create: {
        email: 'demo@assurio.test',
        name: 'Demo Owner',
        passwordHash,
        role: 'owner',
        phone: '+919876543210',
      },
      update: { passwordHash },
    });

    // ── Candidates in varied states ──
    const candidates = [
      {
        email: 'sunita+demo@assurio.test',
        name: 'Sunita Devi',
        role: 'Domestic Worker',
        status: 'active',
        passwordHash,
        phone: '+919876543210',
        panNumber: 'FZLPD8531K',
        aadhaarNumber: '567856785678',
        panFront: docImage('PAN — front', '#3a4a6b'),
        panBack: docImage('PAN — back', '#3a4a6b'),
        aadhaarFront: docImage('Aadhaar — front', '#5b6a85'),
        aadhaarBack: docImage('Aadhaar — back', '#5b6a85'),
        panResult: panResult as object,
        aadhaarResult: aadhaarResult as object,
        crimeRequestId: 'REQ-20451',
        crimeResult: crimeResult as object,
        verificationLog: [
          { type: 'pan', calledAt: '2026-07-24T10:12:00.000Z', result: panResult },
          { type: 'aadhaar', calledAt: '2026-07-25T09:03:00.000Z', result: aadhaarResult },
          { type: 'crime', calledAt: '2026-07-27T16:40:00.000Z', result: crimeResult },
        ] as object,
      },
      {
        email: 'arjun+demo@assurio.test',
        name: 'Arjun Patel',
        role: 'Driver',
        status: 'active',
        panNumber: 'BKPPA2210L',
        panResult: {
          ...panResult,
          full_name: 'Arjun Patel',
          pan_number: 'BKPPA2210L',
          gender: 'M',
          dob: '1988-02-02',
        } as object,
        aadhaarResult: { ...aadhaarResult, name: 'Arjun Patel', dob: '1988-02-02', gender: 'M' } as object,
        crimeRequestId: 'REQ-20452', // crime pending — no result yet
      },
      {
        email: 'meena+demo@assurio.test',
        name: 'Meena Joshi',
        role: 'Tenant',
        status: 'invited',
      },
      {
        email: 'vikram+demo@assurio.test',
        name: 'Vikram Singh',
        role: 'Security Guard',
        status: 'active',
        panNumber: 'CQZPS7743M',
        panResult: {
          ...panResult,
          full_name: 'Vikram Singh',
          pan_number: 'CQZPS7743M',
          gender: 'M',
          dob: '1990-11-23',
        } as object,
      },
    ];

    for (const c of candidates) {
      const existing = await prisma.subject.findFirst({
        where: { email: c.email, userId: owner.id },
      });
      const data = { ...c, userId: owner.id };
      if (existing) {
        await prisma.subject.update({ where: { id: existing.id }, data: data as never });
      } else {
        await prisma.subject.create({ data: data as never });
      }
    }

    const sunita = await prisma.subject.findFirst({
      where: { email: 'sunita+demo@assurio.test', userId: owner.id },
    });

    console.log('✓ Demo data seeded.');
    console.log(`  owner:     demo@assurio.test / ${PASSWORD}`);
    console.log(`  candidate: sunita+demo@assurio.test / ${PASSWORD}`);
    console.log(`  report:    /subject/${sunita?.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
