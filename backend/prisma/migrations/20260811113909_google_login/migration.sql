-- Google sign-in: stable link to the Google account (`sub` claim).
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
