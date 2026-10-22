-- Experian bureau integration: fine-grained CreditReport processing status,
-- identity-based caching/locking, and cache-provenance tracking.

-- 1. New enum for the bureau pipeline's own 5-state status (distinct from
--    the shared StageStatus used elsewhere for the coarser journey tracker).
CREATE TYPE "BureauProcessingStatus" AS ENUM ('QUEUED', 'FETCHING', 'ANALYZING', 'COMPLETED', 'FAILED');

-- 2. Convert CreditReport.processingStatus from StageStatus to the new enum.
--    The only value ever written so far is 'COMPLETED' (verified against
--    the current dev database before writing this migration), which exists
--    in both enums, so a direct text-cast round-trip is safe.
ALTER TABLE "CreditReport"
  ALTER COLUMN "processingStatus" DROP DEFAULT,
  ALTER COLUMN "processingStatus" TYPE "BureauProcessingStatus" USING ("processingStatus"::text::"BureauProcessingStatus"),
  ALTER COLUMN "processingStatus" SET DEFAULT 'QUEUED';

-- 3. New columns.
ALTER TABLE "CreditReport"
  ADD COLUMN "errorMessage" TEXT,
  ADD COLUMN "identityKey" TEXT,
  ADD COLUMN "sourceReportId" TEXT;

-- Backfill: the only pre-existing row is dev seed data with no real
-- identity components on hand — a fixed placeholder is fine since it's
-- COMPLETED (never participates in the in-flight partial unique index
-- added below) and this column is only ever read going forward for rows
-- created by the real bureau-integration code path.
UPDATE "CreditReport" SET "identityKey" = 'legacy-seed-data-no-identity-recorded' WHERE "identityKey" IS NULL;

ALTER TABLE "CreditReport" ALTER COLUMN "identityKey" SET NOT NULL;

ALTER TABLE "CreditReport"
  ADD CONSTRAINT "CreditReport_sourceReportId_fkey"
  FOREIGN KEY ("sourceReportId") REFERENCES "CreditReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CreditReport_identityKey_idx" ON "CreditReport"("identityKey");

-- 4. The database-backed lock: at most one in-flight (non-terminal) bureau
--    request per identity at a time. A second concurrent trigger's attempt
--    to INSERT another QUEUED row for the same identity hits this unique
--    violation and is treated as "already in progress" rather than
--    duplicating the live Experian call.
CREATE UNIQUE INDEX "CreditReport_identityKey_inflight_key"
  ON "CreditReport"("identityKey")
  WHERE "processingStatus" IN ('QUEUED', 'FETCHING', 'ANALYZING');
