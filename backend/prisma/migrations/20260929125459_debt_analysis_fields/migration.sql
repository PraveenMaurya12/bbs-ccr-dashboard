-- Debt Analysis tab support: the fields CreditReport/CreditAccount needed
-- (DPD, EMI, overdue amount, credit limit, secured flag, lifecycle status,
-- payment history) plus a new CreditEnquiry model. CreditAccount has zero
-- rows in every environment this has been run against, so its new
-- non-nullable `overdueAmount` column is safe with a plain default;
-- CreditReport has real (seed) rows, so its one new column is nullable.

-- AlterTable: CreditReport
ALTER TABLE "CreditReport" ADD COLUMN "willfulDefaultFlag" BOOLEAN;

-- AlterTable: CreditAccount
ALTER TABLE "CreditAccount" ADD COLUMN "overdueAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "CreditAccount" ADD COLUMN "currentDpdDays" INTEGER;
ALTER TABLE "CreditAccount" ADD COLUMN "maxDpdDays" INTEGER;
ALTER TABLE "CreditAccount" ADD COLUMN "monthlyEmiAmount" DECIMAL(14,2);
ALTER TABLE "CreditAccount" ADD COLUMN "creditLimit" DECIMAL(14,2);
ALTER TABLE "CreditAccount" ADD COLUMN "isSecured" BOOLEAN;
ALTER TABLE "CreditAccount" ADD COLUMN "lifecycleStatus" TEXT;
ALTER TABLE "CreditAccount" ADD COLUMN "paymentHistoryGrid" JSONB;

-- CreateTable: CreditEnquiry
CREATE TABLE "CreditEnquiry" (
  "id" TEXT NOT NULL,
  "creditReportId" TEXT NOT NULL,
  "enquiryDate" TIMESTAMP(3) NOT NULL,
  "purpose" TEXT NOT NULL,
  "memberName" TEXT NOT NULL,
  CONSTRAINT "CreditEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditEnquiry_creditReportId_idx" ON "CreditEnquiry"("creditReportId");

-- AddForeignKey
ALTER TABLE "CreditEnquiry" ADD CONSTRAINT "CreditEnquiry_creditReportId_fkey"
  FOREIGN KEY ("creditReportId") REFERENCES "CreditReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
