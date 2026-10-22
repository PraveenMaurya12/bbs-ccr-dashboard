-- CreateEnum
CREATE TYPE "PathwayConfidenceLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'UNRESOLVED');

-- CreateEnum
CREATE TYPE "PathwayStatus" AS ENUM ('READY', 'BLOCKED', 'INSUFFICIENT_DATA', 'SPECIALIST_REVIEW', 'MANUAL_REVIEW', 'OUT_OF_SCOPE', 'NO_SUITABLE_PATHWAY', 'EXPIRED', 'EXPIRED_UNACCEPTED');

-- CreateEnum
CREATE TYPE "PathwayVariant" AS ENUM ('STANDARD', 'NINETY_DAY');

-- CreateEnum
CREATE TYPE "PathwayGenerationStatus" AS ENUM ('GENERATING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PathwayEvaluationResult" AS ENUM ('FIRED', 'NOT_FIRED', 'NOT_EVALUATED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "BbsPlan" ADD COLUMN     "sourcePathwayDecisionGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "sourcePathwayDecisionId" TEXT,
ADD COLUMN     "sourcePathwayDecisionVersion" INTEGER;

-- CreateTable
CREATE TABLE "PathwayDecision" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "PathwayGenerationStatus" NOT NULL DEFAULT 'GENERATING',
    "errorMessage" TEXT,
    "ruleVersion" TEXT NOT NULL,
    "sourceCohortDecisionId" TEXT,
    "sourceCohortDecisionVersion" INTEGER,
    "sourceCohortDecisionGeneratedAt" TIMESTAMP(3),
    "sourceMasterProfileVersion" INTEGER,
    "generatedAt" TIMESTAMP(3),
    "primaryPathway" "CohortPathway",
    "pathwayVariant" "PathwayVariant",
    "pathwayStatus" "PathwayStatus",
    "blockingReason" TEXT,
    "inheritedBlocks" JSONB,
    "l4PrimaryState" "CohortPrimaryState",
    "l4PrimaryReasonCode" TEXT,
    "l4SecondaryFlags" JSONB,
    "alternatives" JSONB,
    "sequencingHint" JSONB,
    "confidence" "PathwayConfidenceLevel",
    "confidenceMethod" TEXT,
    "dataQualityBand" TEXT,
    "dimensionConfidences" JSONB,
    "capacityBand" "CapacityBand",
    "capacityCap" "CapacityBand",
    "resolutionCapacity" TEXT,
    "archetype" "CohortArchetype",
    "archetypeConfidence" TEXT,
    "suitabilityConditions" JSONB,
    "customerReasons" JSONB,
    "internalReasons" JSONB,
    "unresolvedQuestions" JSONB,
    "riskFlags" JSONB,
    "requiredApprovals" JSONB,
    "specialistReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "complianceHold" BOOLEAN NOT NULL DEFAULT false,
    "nextActions" JSONB,
    "pathwayTtlDays" INTEGER,
    "ttlExpiresAt" TIMESTAMP(3),
    "presentedToCustomerAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "reviewSchedule" JSONB,
    "changeSummary" JSONB,
    "dataProvenance" JSONB,

    CONSTRAINT "PathwayDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PathwayRuleResult" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "evaluation" "PathwayEvaluationResult" NOT NULL,
    "severity" "CohortRuleSeverity" NOT NULL,
    "evidence" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceFields" JSONB NOT NULL,

    CONSTRAINT "PathwayRuleResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PathwayDecision_leadId_idx" ON "PathwayDecision"("leadId");

-- CreateIndex
CREATE INDEX "PathwayDecision_sourceCohortDecisionId_idx" ON "PathwayDecision"("sourceCohortDecisionId");

-- CreateIndex
CREATE UNIQUE INDEX "PathwayDecision_leadId_version_key" ON "PathwayDecision"("leadId", "version");

-- CreateIndex
CREATE INDEX "PathwayRuleResult_decisionId_idx" ON "PathwayRuleResult"("decisionId");

-- CreateIndex
CREATE INDEX "PathwayRuleResult_ruleId_idx" ON "PathwayRuleResult"("ruleId");

-- CreateIndex
CREATE INDEX "BbsPlan_sourcePathwayDecisionId_idx" ON "BbsPlan"("sourcePathwayDecisionId");

-- AddForeignKey
ALTER TABLE "PathwayDecision" ADD CONSTRAINT "PathwayDecision_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayDecision" ADD CONSTRAINT "PathwayDecision_sourceCohortDecisionId_fkey" FOREIGN KEY ("sourceCohortDecisionId") REFERENCES "CohortDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayRuleResult" ADD CONSTRAINT "PathwayRuleResult_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "PathwayDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BbsPlan" ADD CONSTRAINT "BbsPlan_sourcePathwayDecisionId_fkey" FOREIGN KEY ("sourcePathwayDecisionId") REFERENCES "PathwayDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

