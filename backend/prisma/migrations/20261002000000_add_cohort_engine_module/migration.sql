-- CreateEnum
CREATE TYPE "CohortDecisionStatus" AS ENUM ('GENERATING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CohortPrimaryState" AS ENUM ('CONSENT_PENDING', 'KYC_PENDING', 'X1', 'C6', 'C5', 'C4', 'C3', 'C2', 'C1', 'C7', 'X2', 'MANUAL_REVIEW', 'CUSTOMER_UNRESPONSIVE');

-- CreateEnum
CREATE TYPE "CohortArchetype" AS ENUM ('CIRCUMSTANTIAL', 'DEBT_SPIRAL', 'HABITUAL_AVOIDER', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "CohortPathway" AS ENUM ('OPTIMISE', 'STABILISE', 'CONSOLIDATE', 'RESTRUCTURE', 'RESOLVE', 'RECOVER');

-- CreateEnum
CREATE TYPE "CapacityBand" AS ENUM ('DISTRESSED', 'STRESSED', 'TIGHT', 'COMFORTABLE');

-- CreateEnum
CREATE TYPE "DebtComplexityBand" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'VERY_HIGH');

-- CreateEnum
CREATE TYPE "CohortPlanEligibility" AS ENUM ('DRAFT', 'CCR_REVIEW', 'SPECIALIST', 'INSUFFICIENT_DATA', 'OUT_OF_SCOPE');

-- CreateEnum
CREATE TYPE "CohortConfidenceLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "CohortRuleSeverity" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "CohortEvidenceLevel" AS ENUM ('CONFIRMED', 'DERIVED', 'INDICATED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "CohortDecision" DROP COLUMN "cohort",
ADD COLUMN     "archetype" "CohortArchetype",
ADD COLUMN     "capacityBand" "CapacityBand",
ADD COLUMN     "capacityRatio" DOUBLE PRECISION,
ADD COLUMN     "confidence" "CohortConfidenceLevel",
ADD COLUMN     "consentVersion" TEXT,
ADD COLUMN     "customerExplanation" TEXT,
ADD COLUMN     "dataProvenance" JSONB,
ADD COLUMN     "debtComplexityBand" "DebtComplexityBand",
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "generatedAt" TIMESTAMP(3),
ADD COLUMN     "manualReviewRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "missingData" JSONB,
ADD COLUMN     "nextReviewEvent" JSONB,
ADD COLUMN     "pathway" "CohortPathway",
ADD COLUMN     "planEligibility" "CohortPlanEligibility",
ADD COLUMN     "primaryCohort" "CohortPrimaryState",
ADD COLUMN     "requiredDocuments" JSONB,
ADD COLUMN     "ruleVersion" TEXT NOT NULL,
ADD COLUMN     "secondaryFlags" JSONB,
ADD COLUMN     "sourceDebtAnalysisCompletedAt" TIMESTAMP(3),
ADD COLUMN     "sourceFinancialAnalysisCompletedAt" TIMESTAMP(3),
ADD COLUMN     "sourceMasterProfileGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "sourceMasterProfileId" TEXT,
ADD COLUMN     "sourceMasterProfileVersion" INTEGER,
ADD COLUMN     "specialistReviewRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stabilisationCoverage" DOUBLE PRECISION,
ADD COLUMN     "status" "CohortDecisionStatus" NOT NULL DEFAULT 'GENERATING',
ADD COLUMN     "sustainableCashFlow" DECIMAL(14,2),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "decisionRationale" DROP NOT NULL,
ALTER COLUMN "decidedAt" DROP NOT NULL,
ALTER COLUMN "decidedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "CohortRuleResult" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "evaluated" BOOLEAN NOT NULL,
    "matched" BOOLEAN NOT NULL,
    "severity" "CohortRuleSeverity" NOT NULL,
    "evidence" JSONB NOT NULL,
    "evidenceLevel" "CohortEvidenceLevel" NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceFields" JSONB NOT NULL,

    CONSTRAINT "CohortRuleResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CohortOverride" (
    "id" TEXT NOT NULL,
    "previousDecisionId" TEXT NOT NULL,
    "newDecisionId" TEXT NOT NULL,
    "oldPrimaryCohort" "CohortPrimaryState",
    "newPrimaryCohort" "CohortPrimaryState" NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "approverId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CohortOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CohortRuleResult_decisionId_idx" ON "CohortRuleResult"("decisionId");

-- CreateIndex
CREATE INDEX "CohortRuleResult_ruleId_idx" ON "CohortRuleResult"("ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "CohortOverride_newDecisionId_key" ON "CohortOverride"("newDecisionId");

-- CreateIndex
CREATE INDEX "CohortOverride_previousDecisionId_idx" ON "CohortOverride"("previousDecisionId");

-- CreateIndex
CREATE UNIQUE INDEX "CohortDecision_leadId_version_key" ON "CohortDecision"("leadId", "version");

-- AddForeignKey
ALTER TABLE "CohortRuleResult" ADD CONSTRAINT "CohortRuleResult_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "CohortDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortOverride" ADD CONSTRAINT "CohortOverride_previousDecisionId_fkey" FOREIGN KEY ("previousDecisionId") REFERENCES "CohortDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortOverride" ADD CONSTRAINT "CohortOverride_newDecisionId_fkey" FOREIGN KEY ("newDecisionId") REFERENCES "CohortDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortOverride" ADD CONSTRAINT "CohortOverride_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortOverride" ADD CONSTRAINT "CohortOverride_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

