/*
  Warnings:

  - You are about to drop the column `aiExecutiveSummary` on the `MasterProfile` table. All the data in the column will be lost.
  - You are about to drop the column `cashFlowSnapshot` on the `MasterProfile` table. All the data in the column will be lost.
  - You are about to drop the column `creditSnapshot` on the `MasterProfile` table. All the data in the column will be lost.
  - You are about to drop the column `debtSnapshot` on the `MasterProfile` table. All the data in the column will be lost.
  - You are about to drop the column `incomeSnapshot` on the `MasterProfile` table. All the data in the column will be lost.
  - You are about to drop the column `keyContradictions` on the `MasterProfile` table. All the data in the column will be lost.
  - You are about to drop the column `liquiditySnapshot` on the `MasterProfile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "MasterProfile" DROP COLUMN "aiExecutiveSummary",
DROP COLUMN "cashFlowSnapshot",
DROP COLUMN "creditSnapshot",
DROP COLUMN "debtSnapshot",
DROP COLUMN "incomeSnapshot",
DROP COLUMN "keyContradictions",
DROP COLUMN "liquiditySnapshot";
