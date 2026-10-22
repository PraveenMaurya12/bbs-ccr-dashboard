-- CreateEnum
CREATE TYPE "CohortLifecycleState" AS ENUM ('CCR_REVIEW', 'CUSTOMER_ACCEPTANCE_PENDING', 'EXECUTION_READY', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'CUSTOMER_DECLINED', 'STALE_90D');

-- CreateEnum
CREATE TYPE "CohortComplianceAgingState" AS ENUM ('COMPLIANCE_HOLD', 'COMPLIANCE_AGING', 'COMPLIANCE_ESCALATED', 'COMPLIANCE_CLEARED', 'COMPLIANCE_DECLINED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CohortPrimaryState" ADD VALUE 'COMPLIANCE_HOLD';
ALTER TYPE "CohortPrimaryState" ADD VALUE 'DATA_REFRESH_REQUIRED';
ALTER TYPE "CohortPrimaryState" ADD VALUE 'OTHER_ACCOUNTS_REQUIRED';
ALTER TYPE "CohortPrimaryState" ADD VALUE 'P1_INFORMATION_REQUIRED';
ALTER TYPE "CohortPrimaryState" ADD VALUE 'SPECIALIST_REQUIRED';
ALTER TYPE "CohortPrimaryState" ADD VALUE 'CCR_REQUIRED';

-- AlterTable
ALTER TABLE "CohortDecision" ADD COLUMN     "complianceAgingState" "CohortComplianceAgingState",
ADD COLUMN     "complianceClearedAt" TIMESTAMP(3),
ADD COLUMN     "complianceDeclinedAt" TIMESTAMP(3),
ADD COLUMN     "complianceEscalationAt" TIMESTAMP(3),
ADD COLUMN     "complianceHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "complianceMatchedEntity" TEXT,
ADD COLUMN     "complianceReason" TEXT,
ADD COLUMN     "complianceSlaHours" INTEGER,
ADD COLUMN     "customerReasons" JSONB,
ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "declinedAt" TIMESTAMP(3),
ADD COLUMN     "internalReasons" JSONB,
ADD COLUMN     "lifecycleState" "CohortLifecycleState",
ADD COLUMN     "specialistReviewReason" TEXT;

