-- A verified real Experian response for an identity with no bureau record
-- at all (INProfileResponse.SCORE.BureauScore = -1) reports no real score.
-- CreditReport.creditScore must be nullable to represent that honestly
-- rather than persisting a fabricated placeholder number.
ALTER TABLE "CreditReport" ALTER COLUMN "creditScore" DROP NOT NULL;
