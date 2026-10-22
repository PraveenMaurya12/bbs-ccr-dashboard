import type { DataQualityResult } from '../master-profile.types'

/**
 * BBS Master Profile Module v3.0 §4.4 — replaces a numeric composite Data
 * Quality score entirely with a qualitative band plus an explicit flag
 * list (§4.4.3: "v2.0's numeric DQ... hid more than it revealed").
 *
 * L1/L2 DQ scores and flag codes are read directly from Debt Analysis's and
 * Financial Analysis's own already-computed Data Quality Scores/risk-flag
 * catalogs — never recomputed here. Both modules already use flag
 * vocabularies that overlap exactly with §4.4.2's "inherited from L1/L2"
 * list (e.g. Debt Analysis's own `EMI_SCHEDULED_MISSING`/
 * `HISTORY_INCOMPLETE`/`ACCOUNT_COUNT_MISMATCH`, Financial Analysis's own
 * `FCF_UNRECONCILED`/`OTHER_ACCOUNTS_LIKELY`/`BUSINESS_PERSONAL_MIXED`/
 * `UNCLASSIFIED_TRANSACTIONS`/`RECONCILIATION_FAILED`) — this function
 * folds every one of those real flags in, plus the L3-specific flags this
 * module itself computes (passed in as `l3Flags`), rather than curating a
 * subset and silently dropping real signal.
 */
export function computeDataQualityBand(l1DqTotal: number | null, l2DqTotal: number | null, l1FlagCodes: string[], l2FlagCodes: string[], l3Flags: string[]): DataQualityResult {
  const flags = [...new Set([...l1FlagCodes, ...l2FlagCodes, ...l3Flags])]

  if (l1DqTotal === null || l2DqTotal === null) {
    return { band: 'INSUFFICIENT', flags }
  }

  const flagCount = flags.length
  if (l1DqTotal >= 80 && l2DqTotal >= 80 && flagCount <= 2) return { band: 'HIGH', flags }
  if (l1DqTotal >= 60 && l2DqTotal >= 60 && flagCount <= 5) return { band: 'MODERATE', flags }
  if (l1DqTotal >= 40 && l2DqTotal >= 40 && flagCount <= 10) return { band: 'LOW_MODERATE', flags }
  return { band: 'LOW', flags }
}
