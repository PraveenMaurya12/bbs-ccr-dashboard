-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('OTP', 'PHONE_EMAIL');

-- DropIndex
DROP INDEX "CreditReport_leadId_idx";

-- CreateTable
CREATE TABLE "PhoneVerificationTicket" (
    "id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneVerificationTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhoneVerificationTicket_tokenHash_key" ON "PhoneVerificationTicket"("tokenHash");

-- CreateIndex
CREATE INDEX "PhoneVerificationTicket_mobile_idx" ON "PhoneVerificationTicket"("mobile");
