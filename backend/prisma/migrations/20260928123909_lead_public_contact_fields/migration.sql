-- Public contact-form submissions supply neither an email nor a city, and
-- collect a PAN that must never be stored raw — see schema.prisma doc
-- comments on Lead.email / Lead.city / Lead.panRef for the full rationale.

-- AlterTable
ALTER TABLE "Lead" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "Lead" ALTER COLUMN "city" DROP NOT NULL;
ALTER TABLE "Lead" ADD COLUMN "panRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_panRef_key" ON "Lead"("panRef");
