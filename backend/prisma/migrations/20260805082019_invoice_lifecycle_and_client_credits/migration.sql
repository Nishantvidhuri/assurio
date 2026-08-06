-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('INSTANT_PAID', 'PAYMENT_DUE', 'POSTPAID');

-- CreateEnum
CREATE TYPE "InvoiceBusinessStatus" AS ENUM ('DUE', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "InvoicePaymentMethod" AS ENUM ('RAZORPAY', 'BANK_REMITTANCE', 'BANK_TRANSFER', 'CASH', 'CHEQUE', 'CREDIT_CARD', 'UPI');

-- CreateEnum
CREATE TYPE "InvoicePaymentTerms" AS ENUM ('DUE_ON_RECEIPT', 'NET_15', 'NET_30', 'NET_45', 'NET_60', 'NET_90', 'CUSTOM');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "billingPeriodKey" TEXT,
ADD COLUMN     "businessStatus" "InvoiceBusinessStatus" NOT NULL DEFAULT 'PAID',
ADD COLUMN     "credits" DOUBLE PRECISION,
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "initiatedByEmail" TEXT,
ADD COLUMN     "initiatedById" TEXT,
ADD COLUMN     "initiatedByName" TEXT,
ADD COLUMN     "kind" "InvoiceKind" NOT NULL DEFAULT 'INSTANT_PAID',
ADD COLUMN     "markedPaidAt" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" "InvoicePaymentMethod",
ADD COLUMN     "paymentTerms" "InvoicePaymentTerms",
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ALTER COLUMN "razorpayPaymentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "clientBillingModel" TEXT NOT NULL DEFAULT 'PREPAID',
ADD COLUMN     "creditsBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "InvoicePaymentMethod" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "referenceNumber" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoicePayment_invoiceId_idx" ON "InvoicePayment"("invoiceId");

-- CreateIndex
CREATE INDEX "Invoice_businessStatus_idx" ON "Invoice"("businessStatus");

-- CreateIndex
CREATE INDEX "Invoice_billingPeriodKey_idx" ON "Invoice"("billingPeriodKey");

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
