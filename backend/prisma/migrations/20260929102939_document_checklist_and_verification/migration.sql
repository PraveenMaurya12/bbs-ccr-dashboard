-- Documents tab support: a closed DocumentType checklist enum (replacing
-- the previously-freeform, and until now entirely unused — zero rows —
-- `documentType` text column), a verification workflow, and upload/verify
-- attribution. Safe to run destructively on `documentType` specifically
-- because DocumentMetadata has never had any rows written to it.

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM (
  'PAN_CARD',
  'AADHAAR_CARD',
  'SALARY_SLIP',
  'BANK_STATEMENT',
  'FORM_16',
  'LOAN_STATEMENT',
  'FORECLOSURE_LETTER',
  'ADDRESS_PROOF',
  'EMPLOYMENT_PROOF',
  'OTHER_SUPPORTING'
);

-- CreateEnum
CREATE TYPE "DocumentVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable: DocumentMetadata
ALTER TABLE "DocumentMetadata" DROP COLUMN "documentType";
ALTER TABLE "DocumentMetadata" ADD COLUMN "documentType" "DocumentType" NOT NULL;
ALTER TABLE "DocumentMetadata" ADD COLUMN "originalFilename" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DocumentMetadata" ALTER COLUMN "originalFilename" DROP DEFAULT;
ALTER TABLE "DocumentMetadata" ADD COLUMN "uploadedById" TEXT;
ALTER TABLE "DocumentMetadata" ADD COLUMN "verificationStatus" "DocumentVerificationStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "DocumentMetadata" ADD COLUMN "verifiedById" TEXT;
ALTER TABLE "DocumentMetadata" ADD COLUMN "verifiedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "DocumentMetadata" ADD CONSTRAINT "DocumentMetadata_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentMetadata" ADD CONSTRAINT "DocumentMetadata_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "DocumentMetadata_leadId_documentType_idx" ON "DocumentMetadata"("leadId", "documentType");
