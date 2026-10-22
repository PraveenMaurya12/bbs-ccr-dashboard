-- AlterTable
ALTER TABLE "BankStatementAnalysis" ADD COLUMN     "accountHolderName" TEXT,
ADD COLUMN     "accountType" TEXT,
ADD COLUMN     "ifscCode" TEXT;

-- AlterTable
ALTER TABLE "NormalizedTransaction" ADD COLUMN     "narrationDetail" JSONB;
