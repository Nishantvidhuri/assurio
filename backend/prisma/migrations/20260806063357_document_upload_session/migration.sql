-- CreateEnum
CREATE TYPE "DocumentUploadStatus" AS ENUM ('INTENT_CREATED', 'PRESIGNED', 'COMPLETED', 'SCANNING', 'CLEAN', 'INFECTED', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "DocumentUploadSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "expectedSizeBytes" INTEGER NOT NULL,
    "status" "DocumentUploadStatus" NOT NULL DEFAULT 'INTENT_CREATED',
    "scanStatus" TEXT,
    "etag" TEXT,
    "actualSize" INTEGER,
    "originalFilename" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentUploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentUploadSession_s3Key_key" ON "DocumentUploadSession"("s3Key");

-- CreateIndex
CREATE INDEX "DocumentUploadSession_status_expiresAt_idx" ON "DocumentUploadSession"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "DocumentUploadSession_userId_idx" ON "DocumentUploadSession"("userId");
