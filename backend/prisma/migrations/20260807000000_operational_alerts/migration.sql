-- CreateEnum
CREATE TYPE "OperationalAlertType" AS ENUM ('DEAD_JOBS', 'QUEUE_BACKLOG_AGE', 'OUTBOX_FAILURE', 'DOCUMENT_STORAGE_MISMATCH', 'INFECTED_DOCUMENT_SPIKE');

-- CreateEnum
CREATE TYPE "OperationalAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OperationalAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "OperationalAlert" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "type" "OperationalAlertType" NOT NULL,
    "severity" "OperationalAlertSeverity" NOT NULL,
    "status" "OperationalAlertStatus" NOT NULL DEFAULT 'OPEN',
    "queueName" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "firstOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperationalAlert_dedupeKey_key" ON "OperationalAlert"("dedupeKey");

-- CreateIndex
CREATE INDEX "OperationalAlert_status_lastOccurredAt_idx" ON "OperationalAlert"("status", "lastOccurredAt");
