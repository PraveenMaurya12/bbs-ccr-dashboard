-- CreateEnum
CREATE TYPE "MasterDataQualityBand" AS ENUM ('HIGH', 'MODERATE', 'LOW_MODERATE', 'LOW', 'INSUFFICIENT');

-- CreateEnum
CREATE TYPE "ReadinessOutcome" AS ENUM ('READY', 'CCR_FIRST', 'COMPLIANCE_HOLD', 'SPECIALIST_REVIEW', 'X1_CANDIDATE', 'REGENERATE');

-- CreateEnum
CREATE TYPE "MirPriority" AS ENUM ('P1', 'P2', 'P3');

-- AlterEnum
-- Remaps every existing MasterProfile row's alignmentState onto the new
-- v3.0 5-state vocabulary (hand-written, not Prisma's own naive text-cast
-- diff, because 3 of the old labels are renamed and 2 are removed
-- outright — a plain ::text::new_enum cast fails for any value whose exact
-- spelling doesn't already exist in the new type). Removed states
-- (HIGH_DEBT_CAPACITY_ALIGNED, DATA_CONFLICT_VALIDATION_REQUIRED) become
-- NULL ("not computed under this logic") rather than forced into a
-- same-ish new label — these are historical, regeneratable analysis rows
-- (MasterProfile is append-only/versioned), never the underlying customer
-- source records, and alignmentState is already nullable.
BEGIN;
CREATE TYPE "CreditFinancialAlignmentState_new" AS ENUM ('ALIGNED_HEALTHY', 'CREDIT_STRONG_FINANCIAL_STRESSED', 'CREDIT_STRESSED_FINANCIAL_STRONG', 'BOTH_STRESSED', 'COMPLIANCE_HOLD');
ALTER TABLE "MasterProfile" ALTER COLUMN "alignmentState" TYPE "CreditFinancialAlignmentState_new" USING (
  CASE "alignmentState"::text
    WHEN 'ALIGNED_HEALTHY' THEN 'ALIGNED_HEALTHY'
    WHEN 'CREDIT_CLEAN_FINANCIAL_STRESSED' THEN 'CREDIT_STRONG_FINANCIAL_STRESSED'
    WHEN 'CREDIT_STRESSED_FINANCIAL_CAPABLE' THEN 'CREDIT_STRESSED_FINANCIAL_STRONG'
    WHEN 'CREDIT_STRESSED_FINANCIAL_STRESSED' THEN 'BOTH_STRESSED'
    ELSE NULL
  END::"CreditFinancialAlignmentState_new"
);
ALTER TYPE "CreditFinancialAlignmentState" RENAME TO "CreditFinancialAlignmentState_old";
ALTER TYPE "CreditFinancialAlignmentState_new" RENAME TO "CreditFinancialAlignmentState";
DROP TYPE "public"."CreditFinancialAlignmentState_old";
COMMIT;

-- AlterEnum
ALTER TYPE "ReconciliationMatchState" ADD VALUE 'AMOUNT_MISMATCH';
ALTER TYPE "ReconciliationMatchState" ADD VALUE 'TIMING_MISMATCH';
ALTER TYPE "ReconciliationMatchState" ADD VALUE 'POST_STATEMENT';

-- AlterEnum
-- Same hand-written remap reasoning as above: old LIMITED has no identically-
-- spelled new label, so it needs an explicit mapping (-> TIGHT, the closest
-- new band conceptually) rather than a naive text-cast.
BEGIN;
CREATE TYPE "ResolutionCapacityLevel_new" AS ENUM ('STRONG', 'MODERATE', 'TIGHT', 'MARGINAL', 'NONE', 'UNKNOWN');
ALTER TABLE "MasterProfile" ALTER COLUMN "resolutionCapacity" TYPE "ResolutionCapacityLevel_new" USING (
  CASE "resolutionCapacity"::text
    WHEN 'STRONG' THEN 'STRONG'
    WHEN 'MODERATE' THEN 'MODERATE'
    WHEN 'LIMITED' THEN 'TIGHT'
    WHEN 'UNKNOWN' THEN 'UNKNOWN'
    ELSE 'UNKNOWN'
  END::"ResolutionCapacityLevel_new"
);
ALTER TYPE "ResolutionCapacityLevel" RENAME TO "ResolutionCapacityLevel_old";
ALTER TYPE "ResolutionCapacityLevel_new" RENAME TO "ResolutionCapacityLevel";
DROP TYPE "public"."ResolutionCapacityLevel_old";
COMMIT;

-- AlterTable
ALTER TABLE "MasterProfile" ADD COLUMN     "complianceEscalationHours" INTEGER,
ADD COLUMN     "complianceHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "complianceHoldReason" TEXT,
ADD COLUMN     "complianceHoldSince" TIMESTAMP(3),
ADD COLUMN     "complianceSlaHours" INTEGER,
ADD COLUMN     "dataQualityBand" "MasterDataQualityBand",
ADD COLUMN     "dataQualityFlags" JSONB,
ADD COLUMN     "dimensionConfidences" JSONB,
ADD COLUMN     "exceptionStates" JSONB,
ADD COLUMN     "l1DataAsOf" TIMESTAMP(3),
ADD COLUMN     "l2DataAsOf" TIMESTAMP(3),
ADD COLUMN     "postStatementDebt" JSONB,
ADD COLUMN     "readinessConditions" JSONB,
ADD COLUMN     "readinessOutcome" "ReadinessOutcome";

-- CreateTable
CREATE TABLE "MasterMissingInformationItem" (
    "id" TEXT NOT NULL,
    "masterProfileId" TEXT NOT NULL,
    "itemText" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "priority" "MirPriority" NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MasterMissingInformationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MasterMissingInformationItem_masterProfileId_idx" ON "MasterMissingInformationItem"("masterProfileId");

-- AddForeignKey
ALTER TABLE "MasterMissingInformationItem" ADD CONSTRAINT "MasterMissingInformationItem_masterProfileId_fkey" FOREIGN KEY ("masterProfileId") REFERENCES "MasterProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
