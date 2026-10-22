-- Lead Details tab support: structured help-category/situation fields on
-- Lead, and a much richer, fully-nullable Customer profile that the CCR can
-- now fill in incrementally from the Lead Details tab rather than only at
-- a single "graduation" moment. See schema.prisma doc comments.

-- AlterTable: Lead
ALTER TABLE "Lead" ADD COLUMN "helpCategory" TEXT;
ALTER TABLE "Lead" ADD COLUMN "situation" TEXT;

-- AlterTable: Customer — relax previously-required columns to nullable
ALTER TABLE "Customer" ALTER COLUMN "fullName" DROP NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "city" DROP NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "dateOfBirth" DROP NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "occupation" DROP NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "monthlyIncomeBand" DROP NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "stage" DROP NOT NULL;

-- AlterTable: Customer — new profile fields
ALTER TABLE "Customer" ADD COLUMN "gender" TEXT;
ALTER TABLE "Customer" ADD COLUMN "maritalStatus" TEXT;
ALTER TABLE "Customer" ADD COLUMN "alternateMobile" TEXT;
ALTER TABLE "Customer" ADD COLUMN "employmentType" TEXT;
ALTER TABLE "Customer" ADD COLUMN "companyName" TEXT;
ALTER TABLE "Customer" ADD COLUMN "designation" TEXT;
ALTER TABLE "Customer" ADD COLUMN "monthlySalary" DECIMAL(14,2);
ALTER TABLE "Customer" ADD COLUMN "officialEmail" TEXT;
ALTER TABLE "Customer" ADD COLUMN "workingExperienceYears" INTEGER;
ALTER TABLE "Customer" ADD COLUMN "addressLine1" TEXT;
ALTER TABLE "Customer" ADD COLUMN "addressLine2" TEXT;
ALTER TABLE "Customer" ADD COLUMN "pinCode" TEXT;
ALTER TABLE "Customer" ADD COLUMN "state" TEXT;
ALTER TABLE "Customer" ADD COLUMN "sameAsCurrentAddress" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Customer" ADD COLUMN "permanentAddressLine1" TEXT;
ALTER TABLE "Customer" ADD COLUMN "permanentAddressLine2" TEXT;
ALTER TABLE "Customer" ADD COLUMN "permanentCity" TEXT;
ALTER TABLE "Customer" ADD COLUMN "permanentPinCode" TEXT;
ALTER TABLE "Customer" ADD COLUMN "permanentState" TEXT;
