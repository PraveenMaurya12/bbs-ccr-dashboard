-- CreateEnum
CREATE TYPE "FinancialAnalysisStatus" AS ENUM ('UPLOADED', 'EXTRACTING', 'NORMALIZING', 'CLASSIFYING', 'ANALYZING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BankStatementFileFormat" AS ENUM ('PDF', 'XLSX', 'CSV');

-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "TransactionCategory" AS ENUM ('INCOME', 'BORROWING', 'EXPENSE', 'TRANSFERS', 'CASH', 'OTHER', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "EvidenceLevel" AS ENUM ('CONFIRMED', 'DERIVED', 'INFERRED');

-- CreateEnum
CREATE TYPE "BounceEvidenceTier" AS ENUM ('CONFIRMED_BOUNCE', 'POSSIBLE_BOUNCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FinancialStressBand" AS ENUM ('LOW', 'MODERATE', 'ELEVATED', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FinancialFlagSeverity" AS ENUM ('POSITIVE', 'INFORMATIONAL', 'ATTENTION', 'ELEVATED', 'CRITICAL');

-- CreateTable
CREATE TABLE "BankStatementAnalysis" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "FinancialAnalysisStatus" NOT NULL DEFAULT 'UPLOADED',
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "sourceFileFormat" "BankStatementFileFormat" NOT NULL,
    "parsingMethod" TEXT,
    "extractionConfidence" DOUBLE PRECISION,
    "bankName" TEXT,
    "accountNumberMasked" TEXT,
    "statementPeriodStart" TIMESTAMP(3),
    "statementPeriodEnd" TIMESTAMP(3),
    "openingBalance" DECIMAL(14,2),
    "closingBalance" DECIMAL(14,2),
    "transactionCount" INTEGER,
    "monthsCovered" INTEGER,
    "parserWarnings" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormalizedTransaction" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "narration" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "balance" DECIMAL(14,2),
    "counterparty" TEXT,
    "transactionType" TEXT,
    "category" "TransactionCategory" NOT NULL DEFAULT 'UNCLASSIFIED',
    "subcategory" TEXT,
    "lender" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidenceLevel" "EvidenceLevel" NOT NULL,
    "bounceEvidence" "BounceEvidenceTier",
    "sourceRowRef" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NormalizedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyFinancialAggregate" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "periodMonth" TIMESTAMP(3) NOT NULL,
    "totalInflow" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalOutflow" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netCashFlow" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "normalizedIncome" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "essentialExpenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "financialExpenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discretionaryExpenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "mandatoryDebtPayments" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "creditCardPayments" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "loanInflows" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transferInflows" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transferOutflows" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cashWithdrawals" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cashDeposits" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "closingBalance" DECIMAL(14,2),
    "minBalance" DECIMAL(14,2),
    "lowBalanceDays" INTEGER,
    "observedDays" INTEGER NOT NULL,
    "hadNegativeBalance" BOOLEAN,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "isExceptionalMonth" BOOLEAN NOT NULL DEFAULT false,
    "exceptionalMonthReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyFinancialAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialHealthScore" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "incomeStabilityScore" INTEGER,
    "incomeStabilityAvailability" TEXT NOT NULL,
    "cashFlowStrengthScore" INTEGER,
    "cashFlowStrengthAvailability" TEXT NOT NULL,
    "debtServicingCapacityScore" INTEGER,
    "debtServicingCapacityAvailability" TEXT NOT NULL,
    "liquidityScore" INTEGER,
    "liquidityAvailability" TEXT NOT NULL,
    "expenseBehaviourScore" INTEGER,
    "expenseBehaviourAvailability" TEXT NOT NULL,
    "borrowingDependencyScore" INTEGER,
    "borrowingDependencyAvailability" TEXT NOT NULL,
    "creditPaymentBehaviourScore" INTEGER,
    "creditPaymentBehaviourAvailability" TEXT NOT NULL,
    "transactionBehaviourScore" INTEGER,
    "transactionBehaviourAvailability" TEXT NOT NULL,
    "stressSignalsScore" INTEGER,
    "stressSignalsAvailability" TEXT NOT NULL,
    "totalScore" INTEGER,
    "scorePartial" BOOLEAN NOT NULL DEFAULT false,
    "stressIndicator0to100" INTEGER NOT NULL,
    "stressBand" "FinancialStressBand" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialHealthScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialRiskFlag" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "severity" "FinancialFlagSeverity" NOT NULL,
    "detail" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "relatedMonth" TIMESTAMP(3),
    "relatedTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialRiskFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementAnalysis_documentId_key" ON "BankStatementAnalysis"("documentId");

-- CreateIndex
CREATE INDEX "BankStatementAnalysis_leadId_idx" ON "BankStatementAnalysis"("leadId");

-- CreateIndex
CREATE INDEX "NormalizedTransaction_analysisId_idx" ON "NormalizedTransaction"("analysisId");

-- CreateIndex
CREATE INDEX "NormalizedTransaction_leadId_transactionDate_idx" ON "NormalizedTransaction"("leadId", "transactionDate");

-- CreateIndex
CREATE INDEX "NormalizedTransaction_leadId_category_idx" ON "NormalizedTransaction"("leadId", "category");

-- CreateIndex
CREATE INDEX "MonthlyFinancialAggregate_leadId_periodMonth_idx" ON "MonthlyFinancialAggregate"("leadId", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyFinancialAggregate_analysisId_periodMonth_key" ON "MonthlyFinancialAggregate"("analysisId", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialHealthScore_analysisId_key" ON "FinancialHealthScore"("analysisId");

-- CreateIndex
CREATE INDEX "FinancialHealthScore_analysisId_idx" ON "FinancialHealthScore"("analysisId");

-- CreateIndex
CREATE INDEX "FinancialRiskFlag_analysisId_idx" ON "FinancialRiskFlag"("analysisId");

-- CreateIndex
CREATE INDEX "FinancialRiskFlag_analysisId_severity_idx" ON "FinancialRiskFlag"("analysisId", "severity");

-- CreateIndex
CREATE INDEX "FinancialRiskFlag_key_idx" ON "FinancialRiskFlag"("key");

-- AddForeignKey
ALTER TABLE "BankStatementAnalysis" ADD CONSTRAINT "BankStatementAnalysis_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementAnalysis" ADD CONSTRAINT "BankStatementAnalysis_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DocumentMetadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedTransaction" ADD CONSTRAINT "NormalizedTransaction_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "BankStatementAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyFinancialAggregate" ADD CONSTRAINT "MonthlyFinancialAggregate_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "BankStatementAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialHealthScore" ADD CONSTRAINT "FinancialHealthScore_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "BankStatementAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRiskFlag" ADD CONSTRAINT "FinancialRiskFlag_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "BankStatementAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRiskFlag" ADD CONSTRAINT "FinancialRiskFlag_relatedTransactionId_fkey" FOREIGN KEY ("relatedTransactionId") REFERENCES "NormalizedTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
