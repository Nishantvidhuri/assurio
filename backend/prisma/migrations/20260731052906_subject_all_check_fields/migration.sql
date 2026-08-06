-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "dlResult" JSONB,
ADD COLUMN     "drivingLicense" TEXT,
ADD COLUMN     "employmentResult" JSONB,
ADD COLUMN     "passportFileNo" TEXT,
ADD COLUMN     "passportResult" JSONB,
ADD COLUMN     "uan" TEXT,
ADD COLUMN     "voterId" TEXT,
ADD COLUMN     "voterResult" JSONB;
