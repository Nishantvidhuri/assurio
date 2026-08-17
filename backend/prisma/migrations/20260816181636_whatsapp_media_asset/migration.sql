-- CreateTable
CREATE TABLE "WhatsAppMediaAsset" (
    "id" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "filename" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMediaAsset_waMessageId_key" ON "WhatsAppMediaAsset"("waMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppMediaAsset_chatId_idx" ON "WhatsAppMediaAsset"("chatId");
