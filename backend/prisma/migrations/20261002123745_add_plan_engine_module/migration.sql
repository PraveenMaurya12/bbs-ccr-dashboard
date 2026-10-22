-- CreateEnum
CREATE TYPE "BbsPlanGenerationStatus" AS ENUM ('GENERATING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BbsPlanLifecycleStatus" AS ENUM ('DRAFT', 'CCR_REVIEW', 'SPECIALIST_REVIEW', 'CUSTOMER_ACCEPTANCE_PENDING', 'EXECUTION_READY', 'ACTIVE', 'PAUSED', 'REASSESSMENT_REQUIRED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BbsPlanActionOwner" AS ENUM ('CUSTOMER', 'BBS', 'CREDITOR');

-- CreateEnum
CREATE TYPE "BbsPlanActionPhase" AS ENUM ('IMMEDIATE', 'DAY_30', 'DAY_60', 'DAY_90');

-- CreateEnum
CREATE TYPE "BbsPlanConditionState" AS ENUM ('MET', 'PENDING', 'FAILED', 'NOT_APPLICABLE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "BbsPlan" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "generationStatus" "BbsPlanGenerationStatus" NOT NULL DEFAULT 'GENERATING',
    "errorMessage" TEXT,
    "lifecycleStatus" "BbsPlanLifecycleStatus",
    "templateId" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "sourceCohortDecisionId" TEXT,
    "sourceCohortDecisionVersion" INTEGER,
    "sourceCohortDecisionGeneratedAt" TIMESTAMP(3),
    "sourceMasterProfileVersion" INTEGER,
    "generatedAt" TIMESTAMP(3),
    "cohort" "CohortPrimaryState",
    "pathway" "CohortPathway",
    "situationAssessment" JSONB,
    "problemDefinition" JSONB,
    "financialCapacity" JSONB,
    "debtStrategy" JSONB,
    "financialTargets" JSONB,
    "debtTargets" JSONB,
    "risks" JSONB,
    "disclosures" JSONB,
    "successCriteria" JSONB,
    "monitoringTriggers" JSONB,
    "reviewSchedule" JSONB,
    "dataProvenance" JSONB,
    "missingData" JSONB,
    "customerExplanation" TEXT,
    "specialistReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BbsPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BbsPlanAction" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "ownerType" "BbsPlanActionOwner" NOT NULL,
    "phase" "BbsPlanActionPhase" NOT NULL,
    "description" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "timing" TEXT NOT NULL,
    "dependency" TEXT,
    "evidenceRequired" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "BbsPlanAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BbsPlanCondition" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "state" "BbsPlanConditionState" NOT NULL DEFAULT 'UNKNOWN',
    "source" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',

    CONSTRAINT "BbsPlanCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BbsPlanOverride" (
    "id" TEXT NOT NULL,
    "previousPlanId" TEXT NOT NULL,
    "newPlanId" TEXT NOT NULL,
    "oldLifecycleStatus" "BbsPlanLifecycleStatus",
    "newLifecycleStatus" "BbsPlanLifecycleStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "approverId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BbsPlanOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BbsPlan_leadId_idx" ON "BbsPlan"("leadId");

-- CreateIndex
CREATE INDEX "BbsPlan_sourceCohortDecisionId_idx" ON "BbsPlan"("sourceCohortDecisionId");

-- CreateIndex
CREATE UNIQUE INDEX "BbsPlan_leadId_version_key" ON "BbsPlan"("leadId", "version");

-- CreateIndex
CREATE INDEX "BbsPlanAction_planId_idx" ON "BbsPlanAction"("planId");

-- CreateIndex
CREATE INDEX "BbsPlanCondition_planId_idx" ON "BbsPlanCondition"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "BbsPlanOverride_newPlanId_key" ON "BbsPlanOverride"("newPlanId");

-- CreateIndex
CREATE INDEX "BbsPlanOverride_previousPlanId_idx" ON "BbsPlanOverride"("previousPlanId");

-- AddForeignKey
ALTER TABLE "BbsPlan" ADD CONSTRAINT "BbsPlan_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BbsPlan" ADD CONSTRAINT "BbsPlan_sourceCohortDecisionId_fkey" FOREIGN KEY ("sourceCohortDecisionId") REFERENCES "CohortDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BbsPlanAction" ADD CONSTRAINT "BbsPlanAction_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BbsPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BbsPlanCondition" ADD CONSTRAINT "BbsPlanCondition_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BbsPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BbsPlanOverride" ADD CONSTRAINT "BbsPlanOverride_previousPlanId_fkey" FOREIGN KEY ("previousPlanId") REFERENCES "BbsPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BbsPlanOverride" ADD CONSTRAINT "BbsPlanOverride_newPlanId_fkey" FOREIGN KEY ("newPlanId") REFERENCES "BbsPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BbsPlanOverride" ADD CONSTRAINT "BbsPlanOverride_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BbsPlanOverride" ADD CONSTRAINT "BbsPlanOverride_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
