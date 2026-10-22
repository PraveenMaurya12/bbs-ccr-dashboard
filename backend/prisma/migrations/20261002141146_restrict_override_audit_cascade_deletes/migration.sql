-- DropForeignKey
ALTER TABLE "BbsPlanOverride" DROP CONSTRAINT "BbsPlanOverride_newPlanId_fkey";

-- DropForeignKey
ALTER TABLE "BbsPlanOverride" DROP CONSTRAINT "BbsPlanOverride_previousPlanId_fkey";

-- DropForeignKey
ALTER TABLE "CohortOverride" DROP CONSTRAINT "CohortOverride_newDecisionId_fkey";

-- DropForeignKey
ALTER TABLE "CohortOverride" DROP CONSTRAINT "CohortOverride_previousDecisionId_fkey";

-- AddForeignKey
ALTER TABLE "CohortOverride" ADD CONSTRAINT "CohortOverride_previousDecisionId_fkey" FOREIGN KEY ("previousDecisionId") REFERENCES "CohortDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortOverride" ADD CONSTRAINT "CohortOverride_newDecisionId_fkey" FOREIGN KEY ("newDecisionId") REFERENCES "CohortDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BbsPlanOverride" ADD CONSTRAINT "BbsPlanOverride_previousPlanId_fkey" FOREIGN KEY ("previousPlanId") REFERENCES "BbsPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BbsPlanOverride" ADD CONSTRAINT "BbsPlanOverride_newPlanId_fkey" FOREIGN KEY ("newPlanId") REFERENCES "BbsPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
