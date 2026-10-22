-- CreateEnum
CREATE TYPE "BbsPlanActionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED', 'FAILED', 'CANCELLED', 'ESCALATED');

-- AlterTable
ALTER TABLE "BbsPlan" ADD COLUMN     "changeSummary" JSONB,
ADD COLUMN     "planTtlDays" INTEGER,
ADD COLUMN     "ttlExpiresAt" TIMESTAMP(3);

-- AlterTable: convert BbsPlanAction.status from free String to the new enum
-- WITHOUT dropping the column (preserves every existing row's real value —
-- confirmed via source grep that 'PENDING' is the only value ever written).
ALTER TABLE "BbsPlanAction" ADD COLUMN     "slaDays" INTEGER;
ALTER TABLE "BbsPlanAction" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "BbsPlanAction" ALTER COLUMN "status" TYPE "BbsPlanActionStatus" USING ("status"::"BbsPlanActionStatus");
ALTER TABLE "BbsPlanAction" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "BbsPlanCondition" ADD COLUMN     "escalationPath" TEXT,
ADD COLUMN     "priority" TEXT,
ADD COLUMN     "verificationEvidence" TEXT,
ADD COLUMN     "verifiedById" TEXT;

-- AddForeignKey
ALTER TABLE "BbsPlanCondition" ADD CONSTRAINT "BbsPlanCondition_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
