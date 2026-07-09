-- CreateTable
CREATE TABLE "SubjectDraft" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "patch" JSONB NOT NULL,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubjectDraft_subjectId_key" ON "SubjectDraft"("subjectId");
