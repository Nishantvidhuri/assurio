-- DropIndex
DROP INDEX "CandidateFormDraft_userId_key";

-- CreateIndex
CREATE INDEX "CandidateFormDraft_userId_idx" ON "CandidateFormDraft"("userId");
