-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "reportPdfGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "reportPdfS3Key" TEXT;
