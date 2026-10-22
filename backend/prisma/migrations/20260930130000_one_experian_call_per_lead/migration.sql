-- CRITICAL BUSINESS RULE: at most one Experian call is ever made per BBS
-- lead. This migration replaces the previous identity-based cache/reuse
-- design (which allowed a fresh call after a validity window expired)
-- with a hard, database-enforced "one CreditReport row per lead, ever"
-- invariant.

-- 1. Historical cleanup required before the new UNIQUE(leadId) constraint
--    can be added: two real Experian calls were made for one lead
--    (BBS-LD-331618) before this invariant existed, producing two rows —
--    the first from a since-fixed parser bug, the second reaching the
--    (still unmapped) real response. Keep only the more informative,
--    more recent row per lead; this is a one-time historical cleanup, not
--    a general-purpose "keep latest" policy (no code relies on this
--    ability going forward — a lead only ever gets one row from here on).
DELETE FROM "CreditReport" a
USING "CreditReport" b
WHERE a."leadId" = b."leadId" AND a."createdAt" < b."createdAt";

-- 2. Reclassify the one surviving historical FAILED row that was actually
--    an unmapped (not transport-level) response, while the old enum value
--    is still valid, so it correctly becomes REQUIRES_REVIEW rather than
--    the generic FAILED once the new enum is in place below.
UPDATE "CreditReport"
SET "errorMessage" = "errorMessage"
WHERE "processingStatus" = 'FAILED'
  AND "errorMessage" LIKE '%no verified field mapping%';
-- (marker no-op update above kept the row identifiable through the enum
-- swap by content; the actual status value is reassigned after the type
-- conversion below, since 'REQUIRES_REVIEW' doesn't exist in the OLD enum yet)

-- 3. Drop the old identity-based locking/caching apparatus entirely.
DROP INDEX IF EXISTS "CreditReport_identityKey_inflight_key";
DROP INDEX IF EXISTS "CreditReport_identityKey_idx";
ALTER TABLE "CreditReport" DROP CONSTRAINT IF EXISTS "CreditReport_sourceReportId_fkey";
ALTER TABLE "CreditReport" DROP COLUMN IF EXISTS "sourceReportId";
ALTER TABLE "CreditReport" DROP COLUMN IF EXISTS "identityKey";

-- 4. New columns for the one-call audit trail.
ALTER TABLE "CreditReport"
  ADD COLUMN "errorCode" TEXT,
  ADD COLUMN "rawResponse" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3);

-- 5. Convert the status enum: QUEUED/FETCHING/ANALYZING collapse into
--    IN_PROGRESS (no in-flight rows currently exist, so this is a type-only
--    concern), and the one historical unmapped-response row (marked above)
--    becomes REQUIRES_REVIEW instead of the generic FAILED.
CREATE TYPE "BureauProcessingStatus_new" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'NO_RECORD', 'FAILED', 'REQUIRES_REVIEW');

ALTER TABLE "CreditReport" ALTER COLUMN "processingStatus" DROP DEFAULT;

ALTER TABLE "CreditReport" ALTER COLUMN "processingStatus" TYPE "BureauProcessingStatus_new" USING (
  CASE
    WHEN "processingStatus"::text IN ('QUEUED', 'FETCHING', 'ANALYZING') THEN 'IN_PROGRESS'
    WHEN "processingStatus"::text = 'FAILED' AND "errorMessage" LIKE '%no verified field mapping%' THEN 'REQUIRES_REVIEW'
    ELSE "processingStatus"::text
  END::"BureauProcessingStatus_new"
);

ALTER TABLE "CreditReport" ALTER COLUMN "processingStatus" SET DEFAULT 'IN_PROGRESS';

DROP TYPE "BureauProcessingStatus";
ALTER TYPE "BureauProcessingStatus_new" RENAME TO "BureauProcessingStatus";

-- 6. The actual enforcement mechanism: at most one CreditReport row per lead.
ALTER TABLE "CreditReport" ADD CONSTRAINT "CreditReport_leadId_key" UNIQUE ("leadId");
