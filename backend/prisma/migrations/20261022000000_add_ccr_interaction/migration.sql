-- CreateEnum
CREATE TYPE "CcrInteractionStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "CcrResponseStatus" AS ENUM ('ANSWERED', 'CUSTOMER_DECLINED', 'NOT_KNOWN');

-- CreateTable
CREATE TABLE "CcrInteraction" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "CcrInteractionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CcrInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CcrAnswer" (
    "id" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "fieldKey" TEXT,
    "responseStatus" "CcrResponseStatus" NOT NULL,
    "answerText" TEXT,
    "answerAmount" DECIMAL(14,2),
    "answerBoolean" BOOLEAN,
    "appliedTo" TEXT,
    "conflictNote" TEXT,
    "answeredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CcrAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CcrInteraction_leadId_key" ON "CcrInteraction"("leadId");

-- CreateIndex
CREATE INDEX "CcrAnswer_interactionId_idx" ON "CcrAnswer"("interactionId");

-- CreateIndex
CREATE UNIQUE INDEX "CcrAnswer_leadId_questionKey_key" ON "CcrAnswer"("leadId", "questionKey");

-- AddForeignKey
ALTER TABLE "CcrInteraction" ADD CONSTRAINT "CcrInteraction_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CcrAnswer" ADD CONSTRAINT "CcrAnswer_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "CcrInteraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

