-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "razorpayOrderId" TEXT;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "consentAcceptedAt" TIMESTAMP(3);
