-- CreateEnum
CREATE TYPE "VendorName" AS ENUM ('SUREPASS', 'KONNECTNXT', 'IN_HOUSE_OCR', 'TELECMI');

-- CreateEnum
CREATE TYPE "VendorCategory" AS ENUM ('KYC', 'BGV', 'TELEPHONY', 'OCR');

-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('ACTIVE', 'DEGRADED', 'DISABLED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "VendorBillingModel" AS ENUM ('PREPAID', 'POSTPAID', 'INTERNAL', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('USD', 'EUR', 'JPY', 'INR', 'GBP');

-- CreateEnum
CREATE TYPE "VendorVerificationType" AS ENUM ('DIGILOCKER_INIT', 'DIGILOCKER_STATUS', 'AADHAAR_V2', 'PAN_PAN', 'VOTER_ID', 'PASSPORT', 'DRIVING_LICENSE', 'AADHAAR_OCR_FRONT', 'AADHAAR_OCR_BACK', 'VOTER_OCR_FRONT', 'VOTER_OCR_BACK', 'PAN_OCR', 'PASSPORT_OCR_FRONT', 'PASSPORT_OCR_BACK', 'DRIVING_LICENSE_OCR', 'EMPLOYMENT_HISTORY', 'CRIMINAL_CHECK', 'CREDIT_REPORT_CHECK', 'AML_CHECK');

-- CreateEnum
CREATE TYPE "VendorCapabilityRole" AS ENUM ('PRIMARY', 'FALLBACK');

-- CreateEnum
CREATE TYPE "VendorCostSource" AS ENUM ('RATE_CARD', 'VENDOR_RESPONSE', 'INTERNAL', 'NONE');

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "code" "VendorName" NOT NULL,
    "displayName" TEXT NOT NULL,
    "category" "VendorCategory" NOT NULL,
    "status" "VendorStatus" NOT NULL DEFAULT 'ACTIVE',
    "billingModel" "VendorBillingModel" NOT NULL,
    "website" TEXT,
    "supportEmail" TEXT,
    "accountManager" TEXT,
    "slaNotes" TEXT,
    "currencyCode" "CurrencyCode" NOT NULL DEFAULT 'INR',
    "lowBalanceThreshold" DECIMAL(14,2),
    "requestTimeoutMs" INTEGER,
    "syncReportedBalance" BOOLEAN NOT NULL DEFAULT true,
    "subscriptionAnnualCost" DECIMAL(14,2),
    "subscriptionRenewalAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorCostRate" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "endpointPrefix" TEXT NOT NULL,
    "verificationType" "VendorVerificationType",
    "unitCost" DECIMAL(14,4) NOT NULL,
    "currencyCode" "CurrencyCode" NOT NULL DEFAULT 'INR',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorCostRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorBalanceSnapshot" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "reportedBalance" DECIMAL(14,2),
    "reportedUnit" TEXT,
    "reportedCurrency" "CurrencyCode",
    "reportedAt" TIMESTAMP(3),
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorBalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorBalanceReading" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "reportedBalance" DECIMAL(14,2) NOT NULL,
    "reportedUnit" TEXT,
    "reportedCurrency" "CurrencyCode",
    "source" TEXT,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorBalanceReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorCapability" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "verificationType" "VendorVerificationType",
    "endpointPrefix" TEXT,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "role" "VendorCapabilityRole" NOT NULL DEFAULT 'PRIMARY',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorApiCallAudit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "candidateCaseId" TEXT,
    "candidateCaseCheckId" TEXT,
    "vendorVerificationId" TEXT,
    "vendor" "VendorName" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "httpMethod" TEXT NOT NULL,
    "httpStatusCode" INTEGER,
    "durationMs" INTEGER,
    "requestPayload" JSONB NOT NULL,
    "responseBody" JSONB,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "actorUserId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "attemptNumber" INTEGER,
    "maxAttempts" INTEGER,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "costAmount" DECIMAL(14,2),
    "costCurrency" "CurrencyCode",
    "costSource" "VendorCostSource",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorApiCallAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_code_key" ON "Vendor"("code");

-- CreateIndex
CREATE INDEX "Vendor_status_idx" ON "Vendor"("status");

-- CreateIndex
CREATE INDEX "Vendor_category_idx" ON "Vendor"("category");

-- CreateIndex
CREATE INDEX "VendorCostRate_vendorId_endpointPrefix_effectiveFrom_idx" ON "VendorCostRate"("vendorId", "endpointPrefix", "effectiveFrom");

-- CreateIndex
CREATE INDEX "VendorCostRate_vendorId_verificationType_idx" ON "VendorCostRate"("vendorId", "verificationType");

-- CreateIndex
CREATE UNIQUE INDEX "VendorCostRate_vendorId_endpointPrefix_effectiveFrom_key" ON "VendorCostRate"("vendorId", "endpointPrefix", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "VendorBalanceSnapshot_vendorId_key" ON "VendorBalanceSnapshot"("vendorId");

-- CreateIndex
CREATE INDEX "VendorBalanceReading_vendorId_readAt_idx" ON "VendorBalanceReading"("vendorId", "readAt");

-- CreateIndex
CREATE INDEX "VendorCapability_vendorId_idx" ON "VendorCapability"("vendorId");

-- CreateIndex
CREATE INDEX "VendorCapability_verificationType_idx" ON "VendorCapability"("verificationType");

-- CreateIndex
CREATE UNIQUE INDEX "VendorCapability_vendorId_code_key" ON "VendorCapability"("vendorId", "code");

-- CreateIndex
CREATE INDEX "VendorApiCallAudit_candidateCaseId_createdAt_idx" ON "VendorApiCallAudit"("candidateCaseId", "createdAt");

-- CreateIndex
CREATE INDEX "VendorApiCallAudit_candidateCaseCheckId_createdAt_idx" ON "VendorApiCallAudit"("candidateCaseCheckId", "createdAt");

-- CreateIndex
CREATE INDEX "VendorApiCallAudit_vendor_endpoint_createdAt_idx" ON "VendorApiCallAudit"("vendor", "endpoint", "createdAt");

-- CreateIndex
CREATE INDEX "VendorApiCallAudit_vendor_success_createdAt_idx" ON "VendorApiCallAudit"("vendor", "success", "createdAt");

-- CreateIndex
CREATE INDEX "VendorApiCallAudit_vendor_costSource_idx" ON "VendorApiCallAudit"("vendor", "costSource");

-- CreateIndex
CREATE INDEX "VendorApiCallAudit_actorUserId_createdAt_idx" ON "VendorApiCallAudit"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "VendorApiCallAudit_vendorVerificationId_idx" ON "VendorApiCallAudit"("vendorVerificationId");

-- AddForeignKey
ALTER TABLE "VendorCostRate" ADD CONSTRAINT "VendorCostRate_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBalanceSnapshot" ADD CONSTRAINT "VendorBalanceSnapshot_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBalanceReading" ADD CONSTRAINT "VendorBalanceReading_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCapability" ADD CONSTRAINT "VendorCapability_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
