-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CCR', 'SUPERVISOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WALK_IN', 'CALL_CENTER', 'ONLINE', 'REFERRAL', 'PARTNER_DEALER');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'REQUIRES_REVIEW');

-- CreateEnum
CREATE TYPE "AnalysisJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('MOCK', 'OPENAI', 'GEMINI', 'DEEPSEEK');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CCR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "bbsLeadId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL,
    "notes" TEXT,
    "assignedCcrId" TEXT,
    "leadSubmissionStatus" "StageStatus" NOT NULL DEFAULT 'COMPLETED',
    "bureauReportStatus" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "level1Status" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "level2Status" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "level3Status" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "recoveryPlanStatus" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "occupation" TEXT NOT NULL,
    "monthlyIncomeBand" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "panRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "relation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentMetadata" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "storageRef" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAccessLog" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "accessedByUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditReport" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "bureau" TEXT NOT NULL,
    "maskedIdNumber" TEXT NOT NULL,
    "pulledAt" TIMESTAMP(3) NOT NULL,
    "creditScore" INTEGER NOT NULL,
    "scoreBand" TEXT NOT NULL,
    "totalActiveAccounts" INTEGER NOT NULL,
    "totalOutstandingBalance" DECIMAL(14,2) NOT NULL,
    "delinquentAccounts" INTEGER NOT NULL,
    "processingStatus" "StageStatus" NOT NULL DEFAULT 'PENDING',
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditAccount" (
    "id" TEXT NOT NULL,
    "creditReportId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "lender" TEXT NOT NULL,
    "openedOn" TIMESTAMP(3) NOT NULL,
    "sanctionedAmount" DECIMAL(14,2) NOT NULL,
    "currentBalance" DECIMAL(14,2) NOT NULL,
    "paymentStatus" TEXT NOT NULL,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAssessment" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "StageStatus" NOT NULL DEFAULT 'PENDING',
    "data" JSONB NOT NULL,
    "assessedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "financialAssessmentId" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "type" TEXT NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "isBounced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "StageStatus" NOT NULL DEFAULT 'PENDING',
    "compositeRiskScore" INTEGER,
    "stabilityIndicators" JSONB,
    "recommendedCohort" TEXT,
    "assessorId" TEXT,
    "assessorNotes" TEXT,
    "assessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL DEFAULT 'MOCK',
    "status" "AnalysisJobStatus" NOT NULL DEFAULT 'QUEUED',
    "requestPayload" JSONB NOT NULL,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisResult" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "findings" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "modelVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CohortDecision" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "customerProfileId" TEXT,
    "cohort" TEXT NOT NULL,
    "decisionRationale" TEXT NOT NULL,
    "decidedById" TEXT,
    "requiresManualOverride" BOOLEAN NOT NULL DEFAULT false,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CohortDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryPlan" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "cohortDecisionId" TEXT NOT NULL,
    "planType" TEXT NOT NULL,
    "principalAmount" DECIMAL(14,2) NOT NULL,
    "tenureMonths" INTEGER NOT NULL,
    "interestRatePercent" DECIMAL(5,2) NOT NULL,
    "monthlyInstallmentAmount" DECIMAL(14,2) NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'PENDING',
    "ownerCcrId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryPlanInstallment" (
    "id" TEXT NOT NULL,
    "recoveryPlanId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "RecoveryPlanInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "leadId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_bbsLeadId_key" ON "Lead"("bbsLeadId");

-- CreateIndex
CREATE INDEX "Lead_assignedCcrId_idx" ON "Lead"("assignedCcrId");

-- CreateIndex
CREATE INDEX "Lead_city_idx" ON "Lead"("city");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_leadId_key" ON "Customer"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_panRef_key" ON "Customer"("panRef");

-- CreateIndex
CREATE INDEX "Contact_customerId_idx" ON "Contact"("customerId");

-- CreateIndex
CREATE INDEX "ConsentRecord_leadId_idx" ON "ConsentRecord"("leadId");

-- CreateIndex
CREATE INDEX "DocumentMetadata_leadId_idx" ON "DocumentMetadata"("leadId");

-- CreateIndex
CREATE INDEX "DocumentAccessLog_documentId_idx" ON "DocumentAccessLog"("documentId");

-- CreateIndex
CREATE INDEX "CreditReport_leadId_idx" ON "CreditReport"("leadId");

-- CreateIndex
CREATE INDEX "CreditAccount_creditReportId_idx" ON "CreditAccount"("creditReportId");

-- CreateIndex
CREATE INDEX "FinancialAssessment_leadId_level_idx" ON "FinancialAssessment"("leadId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAssessment_leadId_level_version_key" ON "FinancialAssessment"("leadId", "level", "version");

-- CreateIndex
CREATE INDEX "BankTransaction_financialAssessmentId_idx" ON "BankTransaction"("financialAssessmentId");

-- CreateIndex
CREATE INDEX "CustomerProfile_leadId_idx" ON "CustomerProfile"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfile_leadId_version_key" ON "CustomerProfile"("leadId", "version");

-- CreateIndex
CREATE INDEX "AnalysisJob_leadId_idx" ON "AnalysisJob"("leadId");

-- CreateIndex
CREATE INDEX "AnalysisJob_status_idx" ON "AnalysisJob"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisResult_jobId_key" ON "AnalysisResult"("jobId");

-- CreateIndex
CREATE INDEX "CohortDecision_leadId_idx" ON "CohortDecision"("leadId");

-- CreateIndex
CREATE INDEX "RecoveryPlan_leadId_idx" ON "RecoveryPlan"("leadId");

-- CreateIndex
CREATE INDEX "RecoveryPlanInstallment_recoveryPlanId_idx" ON "RecoveryPlanInstallment"("recoveryPlanId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_leadId_idx" ON "AuditLog"("leadId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedCcrId_fkey" FOREIGN KEY ("assignedCcrId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentMetadata" ADD CONSTRAINT "DocumentMetadata_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAccessLog" ADD CONSTRAINT "DocumentAccessLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DocumentMetadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditReport" ADD CONSTRAINT "CreditReport_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_creditReportId_fkey" FOREIGN KEY ("creditReportId") REFERENCES "CreditReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAssessment" ADD CONSTRAINT "FinancialAssessment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_financialAssessmentId_fkey" FOREIGN KEY ("financialAssessmentId") REFERENCES "FinancialAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisResult" ADD CONSTRAINT "AnalysisResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortDecision" ADD CONSTRAINT "CohortDecision_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryPlan" ADD CONSTRAINT "RecoveryPlan_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryPlan" ADD CONSTRAINT "RecoveryPlan_cohortDecisionId_fkey" FOREIGN KEY ("cohortDecisionId") REFERENCES "CohortDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryPlanInstallment" ADD CONSTRAINT "RecoveryPlanInstallment_recoveryPlanId_fkey" FOREIGN KEY ("recoveryPlanId") REFERENCES "RecoveryPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
