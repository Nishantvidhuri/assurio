-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "creditRequestId" TEXT,
ADD COLUMN     "creditResult" JSONB,
ADD COLUMN     "dob" TEXT,
ADD COLUMN     "fatherName" TEXT,
ADD COLUMN     "permanentAddress" TEXT,
ADD COLUMN     "pincode" TEXT;
