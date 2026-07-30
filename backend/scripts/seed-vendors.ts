import 'dotenv/config';
import {
  PrismaClient,
  VendorName,
  VendorCategory,
  VendorBillingModel,
  VendorCapabilityRole,
  VendorVerificationType,
  CurrencyCode,
} from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/**
 * Seeds the internal Vendor Management registry: one Vendor row per VendorName
 * enum value, its capabilities, the buy-side cost rate card, subscription
 * config, and an (empty) balance snapshot per prepaid vendor. Same data as
 * migrations 20260630120000_add_vendor_registry + 20260630130000_vendor_cost_and_balance.
 * Safe to run repeatedly (upserts by natural key).
 */

interface CapabilitySeed {
  code: string;
  verificationType: VendorVerificationType | null;
  displayName: string;
  role: VendorCapabilityRole;
  // Endpoint prefix for non-enum capabilities so per-capability cost can
  // resolve by endpoint (e.g. GST lookup).
  endpointPrefix?: string | null;
}

interface CostRateSeed {
  endpointPrefix: string;
  verificationType: VendorVerificationType | null;
  unitCost: number;
}

interface VendorSeed {
  code: VendorName;
  displayName: string;
  category: VendorCategory;
  billingModel: VendorBillingModel;
  syncReportedBalance: boolean;
  subscriptionAnnualCost?: number;
  balanceSource?: string;
  capabilities: CapabilitySeed[];
  costRates: CostRateSeed[];
}

const PRIMARY = VendorCapabilityRole.PRIMARY;
const FALLBACK = VendorCapabilityRole.FALLBACK;
const VT = VendorVerificationType;

// All initial rates effective from before any audit data so historicals cost.
const RATE_EFFECTIVE_FROM = new Date('2020-01-01T00:00:00Z');

const VENDOR_CATALOG: VendorSeed[] = [
  {
    code: VendorName.SUREPASS,
    displayName: 'Surepass',
    category: VendorCategory.KYC,
    billingModel: VendorBillingModel.PREPAID,
    syncReportedBalance: true,
    balanceSource: 'surepass:usage/balance',
    capabilities: [
      {
        code: 'PAN_PAN',
        verificationType: VT.PAN_PAN,
        displayName: 'PAN Verification',
        role: PRIMARY,
      },
      {
        code: 'AADHAAR_V2',
        verificationType: VT.AADHAAR_V2,
        displayName: 'Aadhaar Verification',
        role: PRIMARY,
      },
      {
        code: 'VOTER_ID',
        verificationType: VT.VOTER_ID,
        displayName: 'Voter ID Verification',
        role: PRIMARY,
      },
      {
        code: 'PASSPORT',
        verificationType: VT.PASSPORT,
        displayName: 'Passport Verification',
        role: PRIMARY,
      },
      {
        code: 'DRIVING_LICENSE',
        verificationType: VT.DRIVING_LICENSE,
        displayName: 'Driving License Verification',
        role: PRIMARY,
      },
      {
        code: 'EMPLOYMENT_HISTORY',
        verificationType: VT.EMPLOYMENT_HISTORY,
        displayName: 'Employment History (EPFO)',
        role: PRIMARY,
      },
      {
        code: 'DIGILOCKER',
        verificationType: VT.DIGILOCKER_INIT,
        displayName: 'DigiLocker',
        role: PRIMARY,
      },
      // Fallback OCR (in-house OCR is primary). One row per document type,
      // keyed by its /ocr/* endpoint so per-capability cost + call counts
      // resolve (these calls carry no enum verificationType).
      {
        code: 'AADHAAR_OCR',
        verificationType: null,
        displayName: 'Aadhaar OCR',
        role: FALLBACK,
        endpointPrefix: '/ocr/aadhaar',
      },
      {
        code: 'PAN_OCR',
        verificationType: null,
        displayName: 'PAN OCR',
        role: FALLBACK,
        endpointPrefix: '/ocr/pan',
      },
      {
        code: 'PASSPORT_OCR',
        verificationType: null,
        displayName: 'Passport OCR',
        role: FALLBACK,
        endpointPrefix: '/ocr/passport',
      },
      {
        code: 'DRIVING_LICENSE_OCR',
        verificationType: null,
        displayName: 'Driving License OCR',
        role: FALLBACK,
        endpointPrefix: '/ocr/license',
      },
      {
        code: 'VOTER_OCR',
        verificationType: null,
        displayName: 'Voter OCR',
        role: FALLBACK,
        endpointPrefix: '/ocr/voter',
      },
    ],
    costRates: [
      {
        endpointPrefix: '/pan/pan',
        verificationType: VT.PAN_PAN,
        unitCost: 2.64,
      },
      {
        endpointPrefix: '/voter-id/voter-id',
        verificationType: VT.VOTER_ID,
        unitCost: 3.25,
      },
      {
        endpointPrefix: '/passport/passport',
        verificationType: VT.PASSPORT,
        unitCost: 11.8,
      },
      {
        endpointPrefix: '/driving-license/driving-license',
        verificationType: VT.DRIVING_LICENSE,
        unitCost: 3.24,
      },
      {
        endpointPrefix: '/income/employment-history-uan-v2',
        verificationType: VT.EMPLOYMENT_HISTORY,
        unitCost: 18.29,
      },
      {
        endpointPrefix: '/digilocker/download-aadhaar',
        verificationType: VT.AADHAAR_V2,
        unitCost: 3.24,
      },
      {
        endpointPrefix: '/ocr/aadhaar',
        verificationType: null,
        unitCost: 2.36,
      },
      { endpointPrefix: '/ocr/pan', verificationType: null, unitCost: 29.5 },
      {
        endpointPrefix: '/ocr/passport',
        verificationType: null,
        unitCost: 2.95,
      },
      {
        endpointPrefix: '/ocr/license',
        verificationType: null,
        unitCost: 2.95,
      },
    ],
  },
  {
    code: VendorName.KONNECTNXT,
    displayName: 'KonnectNXT',
    category: VendorCategory.BGV,
    billingModel: VendorBillingModel.PREPAID,
    syncReportedBalance: true,
    balanceSource: 'konnectnxt:credits_remaining',
    capabilities: [
      {
        code: 'CRIMINAL_CHECK',
        verificationType: VT.CRIMINAL_CHECK,
        displayName: 'Criminal Check',
        role: PRIMARY,
      },
      {
        code: 'CREDIT_REPORT_CHECK',
        verificationType: VT.CREDIT_REPORT_CHECK,
        displayName: 'Credit Report',
        role: PRIMARY,
      },
      {
        code: 'AML_CHECK',
        verificationType: VT.AML_CHECK,
        displayName: 'AML Check',
        role: PRIMARY,
      },
      {
        code: 'GST_LOOKUP',
        verificationType: null,
        displayName: 'GST Lookup',
        role: PRIMARY,
        endpointPrefix: '/verification/gst-certificate',
      },
    ],
    costRates: [
      // Real legacy crime endpoint (stamped) + display-only bundled rates
      // (billed via the bgv-submit response, not a per-check endpoint).
      {
        endpointPrefix: '/verification/crime-check',
        verificationType: VT.CRIMINAL_CHECK,
        unitCost: 100,
      },
      {
        endpointPrefix: 'konnectnxt:global-database',
        verificationType: VT.AML_CHECK,
        unitCost: 280,
      },
      {
        endpointPrefix: 'konnectnxt:credit',
        verificationType: VT.CREDIT_REPORT_CHECK,
        unitCost: 220,
      },
      // GSTIN lookup (client-onboarding autofill), ₹10/call. Real endpoint,
      // so it stamps live + backfilled GST audit rows.
      {
        endpointPrefix: '/verification/gst-certificate',
        verificationType: null,
        unitCost: 10,
      },
    ],
  },
  {
    code: VendorName.IN_HOUSE_OCR,
    displayName: 'OCR (In House)',
    category: VendorCategory.OCR,
    billingModel: VendorBillingModel.INTERNAL,
    syncReportedBalance: false,
    capabilities: [
      {
        code: 'AADHAAR_OCR',
        verificationType: VT.AADHAAR_OCR_FRONT,
        displayName: 'Aadhaar OCR',
        role: PRIMARY,
      },
      {
        code: 'PAN_OCR',
        verificationType: VT.PAN_OCR,
        displayName: 'PAN OCR',
        role: PRIMARY,
      },
      {
        code: 'VOTER_OCR',
        verificationType: VT.VOTER_OCR_FRONT,
        displayName: 'Voter OCR',
        role: PRIMARY,
      },
      {
        code: 'DRIVING_LICENSE_OCR',
        verificationType: VT.DRIVING_LICENSE_OCR,
        displayName: 'Driving License OCR',
        role: PRIMARY,
      },
      {
        code: 'PASSPORT_OCR',
        verificationType: VT.PASSPORT_OCR_FRONT,
        displayName: 'Passport OCR',
        role: PRIMARY,
      },
    ],
    costRates: [],
  },
];

export async function seedVendors(prisma: PrismaClient) {
  for (const vendor of VENDOR_CATALOG) {
    const row = await prisma.vendor.upsert({
      where: { code: vendor.code },
      create: {
        code: vendor.code,
        displayName: vendor.displayName,
        category: vendor.category,
        billingModel: vendor.billingModel,
        currencyCode: CurrencyCode.INR,
        syncReportedBalance: vendor.syncReportedBalance,
        subscriptionAnnualCost: vendor.subscriptionAnnualCost ?? null,
      },
      update: {
        displayName: vendor.displayName,
        category: vendor.category,
        billingModel: vendor.billingModel,
        subscriptionAnnualCost: vendor.subscriptionAnnualCost ?? null,
      },
      select: { id: true },
    });

    for (const [index, capability] of vendor.capabilities.entries()) {
      await prisma.vendorCapability.upsert({
        where: {
          vendorId_code: { vendorId: row.id, code: capability.code },
        },
        create: {
          vendorId: row.id,
          code: capability.code,
          verificationType: capability.verificationType,
          endpointPrefix: capability.endpointPrefix ?? null,
          displayName: capability.displayName,
          role: capability.role,
          priority: index,
        },
        update: {
          verificationType: capability.verificationType,
          endpointPrefix: capability.endpointPrefix ?? null,
          displayName: capability.displayName,
          role: capability.role,
          priority: index,
        },
      });
    }

    for (const rate of vendor.costRates) {
      await prisma.vendorCostRate.upsert({
        where: {
          vendorId_endpointPrefix_effectiveFrom: {
            vendorId: row.id,
            endpointPrefix: rate.endpointPrefix,
            effectiveFrom: RATE_EFFECTIVE_FROM,
          },
        },
        create: {
          vendorId: row.id,
          endpointPrefix: rate.endpointPrefix,
          verificationType: rate.verificationType,
          unitCost: rate.unitCost,
          currencyCode: CurrencyCode.INR,
          effectiveFrom: RATE_EFFECTIVE_FROM,
        },
        update: {
          verificationType: rate.verificationType,
          unitCost: rate.unitCost,
        },
      });
    }

    if (vendor.balanceSource) {
      await prisma.vendorBalanceSnapshot.upsert({
        where: { vendorId: row.id },
        create: { vendorId: row.id, source: vendor.balanceSource },
        update: { source: vendor.balanceSource },
      });
    }
  }

  console.log(
    `Vendor registry seeded (${VENDOR_CATALOG.length} vendors, ${VENDOR_CATALOG.reduce(
      (sum, v) => sum + v.capabilities.length,
      0,
    )} capabilities, ${VENDOR_CATALOG.reduce(
      (sum, v) => sum + v.costRates.length,
      0,
    )} cost rates).`,
  );
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

async function main() {
  const databaseUrl = getRequiredEnv('DATABASE_URL');
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await seedVendors(prisma);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
