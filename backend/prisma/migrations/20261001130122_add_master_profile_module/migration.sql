-- CreateEnum
CREATE TYPE "MasterProfileStatus" AS ENUM ('GENERATING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CreditFinancialAlignmentState" AS ENUM ('ALIGNED_HEALTHY', 'CREDIT_CLEAN_FINANCIAL_STRESSED', 'CREDIT_STRESSED_FINANCIAL_CAPABLE', 'CREDIT_STRESSED_FINANCIAL_STRESSED', 'HIGH_DEBT_CAPACITY_ALIGNED', 'DATA_CONFLICT_VALIDATION_REQUIRED');

-- CreateEnum
CREATE TYPE "ResolutionCapacityLevel" AS ENUM ('STRONG', 'MODERATE', 'LIMITED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MasterConfidenceLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ReconciliationMatchState" AS ENUM ('MATCHED', 'PARTIALLY_MATCHED', 'NOT_OBSERVED', 'UNMATCHED_PAYMENT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FinancialTrajectory" AS ENUM ('IMPROVING', 'STABLE', 'DETERIORATING', 'VOLATILE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "MasterProfile" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "MasterProfileStatus" NOT NULL DEFAULT 'GENERATING',
    "errorMessage" TEXT,
    "sourceCreditReportId" TEXT,
    "sourceCreditReportCompletedAt" TIMESTAMP(3),
    "sourceBankStatementAnalysisId" TEXT,
    "sourceBankStatementCompletedAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3),
    "aiProvider" "AiProvider",
    "aiModelVersion" TEXT,
    "alignmentState" "CreditFinancialAlignmentState",
    "resolutionCapacity" "ResolutionCapacityLevel",
    "overallConfidence" "MasterConfidenceLevel",
    "bureauDsrPercent" DOUBLE PRECISION,
    "bankDsrPercent" DOUBLE PRECISION,
    "masterDsrPercent" DOUBLE PRECISION,
    "financialTrajectory" "FinancialTrajectory" NOT NULL DEFAULT 'UNKNOWN',
    "identitySnapshot" JSONB,
    "creditSnapshot" JSONB,
    "debtSnapshot" JSONB,
    "incomeSnapshot" JSONB,
    "cashFlowSnapshot" JSONB,
    "liquiditySnapshot" JSONB,
    "stressProfile" JSONB,
    "strengths" JSONB,
    "concerns" JSONB,
    "opportunitySignals" JSONB,
    "possibleCauses" JSONB,
    "keyContradictions" JSONB,
    "validationRequired" JSONB,
    "cohortAttributes" JSONB,
    "aiExecutiveSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasterProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterProfileReconciliationRow" (
    "id" TEXT NOT NULL,
    "masterProfileId" TEXT NOT NULL,
    "lender" TEXT NOT NULL,
    "product" TEXT,
    "reportedOutstanding" DECIMAL(14,2),
    "reportedEmi" DECIMAL(14,2),
    "observedPayment" DECIMAL(14,2),
    "observedFrequencyMonths" INTEGER,
    "matchStatus" "ReconciliationMatchState" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "explanation" TEXT NOT NULL,

    CONSTRAINT "MasterProfileReconciliationRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MasterProfile_leadId_idx" ON "MasterProfile"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "MasterProfile_leadId_version_key" ON "MasterProfile"("leadId", "version");

-- CreateIndex
CREATE INDEX "MasterProfileReconciliationRow_masterProfileId_idx" ON "MasterProfileReconciliationRow"("masterProfileId");

-- AddForeignKey
ALTER TABLE "MasterProfile" ADD CONSTRAINT "MasterProfile_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterProfileReconciliationRow" ADD CONSTRAINT "MasterProfileReconciliationRow_masterProfileId_fkey" FOREIGN KEY ("masterProfileId") REFERENCES "MasterProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
