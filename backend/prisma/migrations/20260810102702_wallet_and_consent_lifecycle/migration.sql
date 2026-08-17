-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('PENDING', 'GRANTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "WalletTransactionReason" AS ENUM ('TOPUP', 'VERIFICATION_CHARGE', 'CONSENT_REFUND', 'ADMIN_CREDIT', 'ADMIN_DEBIT');

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "consentDecidedAt" TIMESTAMP(3),
ADD COLUMN     "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balancePaise" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "reason" "WalletTransactionReason" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "balanceAfterPaise" INTEGER NOT NULL,
    "subjectId" TEXT,
    "invoiceId" TEXT,
    "razorpayPaymentId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_idempotencyKey_key" ON "WalletTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_subjectId_idx" ON "WalletTransaction"("subjectId");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data migration: every subject that existed before the consent gate shipped
-- keeps its old behaviour — checks already ran (or run off client-attested
-- consent), so mark them GRANTED. Only subjects created after this migration
-- start as PENDING and participate in the hold/refund lifecycle. Without this,
-- the expiry sweep would flip legacy rows to EXPIRED (harmless for money — no
-- charge ledger rows exist for them — but wrong in the UI).
UPDATE "Subject" SET "consentStatus" = 'GRANTED', "consentDecidedAt" = COALESCE("consentAcceptedAt", "createdAt");
