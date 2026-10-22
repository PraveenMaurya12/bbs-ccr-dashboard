-- CreateEnum
CREATE TYPE "CohortComplianceActionType" AS ENUM ('CLEARED', 'DECLINED');

-- CreateTable
CREATE TABLE "CohortComplianceDecision" (
    "id" TEXT NOT NULL,
    "previousDecisionId" TEXT NOT NULL,
    "newDecisionId" TEXT NOT NULL,
    "action" "CohortComplianceActionType" NOT NULL,
    "oldPrimaryCohort" "CohortPrimaryState",
    "newPrimaryCohort" "CohortPrimaryState" NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CohortComplianceDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CohortComplianceDecision_newDecisionId_key" ON "CohortComplianceDecision"("newDecisionId");

-- CreateIndex
CREATE INDEX "CohortComplianceDecision_previousDecisionId_idx" ON "CohortComplianceDecision"("previousDecisionId");

-- AddForeignKey
ALTER TABLE "CohortComplianceDecision" ADD CONSTRAINT "CohortComplianceDecision_previousDecisionId_fkey" FOREIGN KEY ("previousDecisionId") REFERENCES "CohortDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortComplianceDecision" ADD CONSTRAINT "CohortComplianceDecision_newDecisionId_fkey" FOREIGN KEY ("newDecisionId") REFERENCES "CohortDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortComplianceDecision" ADD CONSTRAINT "CohortComplianceDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

