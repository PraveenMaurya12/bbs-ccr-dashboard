import type { NormalizedTransactionInput } from '../financial-analysis.types'

/**
 * Whole-word month names/abbreviations only (word-boundary on both sides —
 * "jan" can never match inside "january" because the trailing boundary
 * would fail, so alternation order doesn't matter here). Confirmed
 * necessary via a real customer's statement: "Salary for the Month of Nov"
 * / "...Dec" / "...Jan" / "...Feb" previously fingerprinted as four
 * DIFFERENT sources (the month word is the only thing that varies month to
 * month) and could never reach the 3-month recurring-income threshold,
 * even though each individual transaction was already correctly classified
 * INCOME by classify-transaction.ts's own salary keyword rule. "may" is
 * included per the full month list even though it's also an ordinary
 * English word — real bank narrations are compact transactional codes,
 * not free prose, so this is a deliberately accepted, low-risk tradeoff.
 */
const MONTH_NAME_PATTERN =
  /\b(?:january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/gi

/**
 * Normalizes a narration into an order-independent token fingerprint —
 * strips long reference/account numbers (which vary every month even for
 * a genuinely recurring payment) so "SALARY CREDIT ABC CORP REF00123456"
 * and "SALARY CREDIT ABC CORP REF00789012" fingerprint identically, and
 * strips month names/abbreviations for the same reason (see
 * MONTH_NAME_PATTERN's own doc comment) — a genuinely different employer/
 * counterparty is untouched by either strip, so "Salary ABC Ltd" and
 * "Salary XYZ Ltd" still fingerprint differently. Deliberately crude (not
 * NLP) — real bank narration variety is enormous; this is a pattern-
 * matching heuristic, not a verified identity match.
 */
export function narrationFingerprint(narration: string): string {
  return narration
    .toLowerCase()
    .replace(MONTH_NAME_PATTERN, ' ')
    .replace(/\d{4,}/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ')
}

/**
 * v4.0 spec §6.2 "Income Source Tracking" defines `monthly_amount` as the
 * MEDIAN of monthly credits, not a mean — deliberately robust to an
 * outlier transition-month partial payment (e.g. a first, pro-rated salary
 * credit) dragging a plain average away from the steady-state figure a CCR
 * actually needs to see as "current income."
 */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function distinctMonthCount(transactions: NormalizedTransactionInput[]): number {
  return new Set(transactions.map((t) => monthKey(t.transactionDate))).size
}

/**
 * Splits a same-narration-fingerprint group into amount-tolerant
 * sub-clusters: sorts by amount, then greedily extends the current
 * sub-cluster while the next amount stays within `toleranceFraction` of
 * the cluster's own running average (not the original seed value), so a
 * gradually-stepping salary (annual increments) still clusters correctly
 * across the whole window rather than splintering at the first jump.
 */
export function clusterByAmountTolerance(transactions: NormalizedTransactionInput[], toleranceFraction: number): NormalizedTransactionInput[][] {
  if (transactions.length === 0) return []
  const sorted = [...transactions].sort((a, b) => a.amount - b.amount)

  const clusters: NormalizedTransactionInput[][] = []
  let current: NormalizedTransactionInput[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const runningAverage = current.reduce((sum, t) => sum + t.amount, 0) / current.length
    const withinTolerance = Math.abs(sorted[i].amount - runningAverage) <= runningAverage * toleranceFraction
    if (withinTolerance) {
      current.push(sorted[i])
    } else {
      clusters.push(current)
      current = [sorted[i]]
    }
  }
  clusters.push(current)
  return clusters
}

function normalizeForTruncationMatch(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z]/g, '')
}

/**
 * Merges two narration-fingerprint groups when one group's representative
 * counterparty name is a left-truncation of the other's — e.g. a bank's
 * IMPS narration format truncates "GOLDEN LEGAND LEASING AND FI..." to
 * "GOLDENLE" while its NEFT format truncates the SAME employer's name
 * differently ("GOLDEN LEGAND LEASING AND FI"). Confirmed against a real
 * statement: the same employer paid salary via IMPS for several months,
 * then switched to NEFT — each rail's own truncation width left no exact-
 * string overlap for the ordinary fingerprint grouping to catch, so the
 * same continuous employment relationship fractured into two separate,
 * each-individually-too-short recurring-income sources.
 *
 * Deliberately narrow — never a fuzzy/edit-distance match, only a genuine
 * post-normalization prefix relationship — and only once the SHORTER name
 * clears `minPrefixLength` characters, so two unrelated payers that merely
 * share a short, generic opening ("RAM" vs "RAMESH ENTERPRISES") can never
 * spuriously merge. A real bank truncates by cutting off the END of a name,
 * never the middle, so this structural relationship generalizes beyond
 * this one employer without needing a hardcoded name list. Scoped to
 * income clustering only (called from recurring-income-detector.ts) — not
 * applied to debt/lender matching, which has its own, separately-reasoned
 * mandate-reference-based fix.
 */
export function mergeTruncatedCounterpartyGroups(groups: Map<string, NormalizedTransactionInput[]>, minPrefixLength = 8): Map<string, NormalizedTransactionInput[]> {
  const merged = new Map(groups)
  const keys = [...merged.keys()]
  const representativeName = (key: string): string => {
    const txns = merged.get(key)
    const first = txns?.[0]
    return normalizeForTruncationMatch(first?.narrationDetail?.counterpartyRaw || first?.narration || '')
  }

  const consumed = new Set<string>()
  for (let i = 0; i < keys.length; i++) {
    const keyA = keys[i]
    if (consumed.has(keyA) || !merged.has(keyA)) continue
    const nameA = representativeName(keyA)
    if (nameA.length < minPrefixLength) continue

    for (let j = i + 1; j < keys.length; j++) {
      const keyB = keys[j]
      if (consumed.has(keyB) || !merged.has(keyB)) continue
      const nameB = representativeName(keyB)
      if (nameB.length < minPrefixLength || nameA === nameB) continue
      if (!nameA.startsWith(nameB) && !nameB.startsWith(nameA)) continue

      const targetKey = (merged.get(keyA)?.length ?? 0) >= (merged.get(keyB)?.length ?? 0) ? keyA : keyB
      const otherKey = targetKey === keyA ? keyB : keyA
      merged.set(targetKey, [...(merged.get(targetKey) ?? []), ...(merged.get(otherKey) ?? [])])
      merged.delete(otherKey)
      consumed.add(otherKey)
    }
  }

  return merged
}

/**
 * Groups transactions by their narration fingerprint — the first clustering
 * pass, before amount-tolerance sub-clustering. Prefers the already-parsed
 * `narrationDetail.counterpartyRaw` over the raw narration string when
 * available: confirmed against a real ACH-DR statement that the mandate-
 * reference suffix in "ACH-DR-INCRED FINANCIAL SER-INCREDXOgEpcpjhlYacA-" is
 * a DIFFERENT random alphanumeric string every month (unlike a plain
 * reference NUMBER, `\d{4,}` stripping in narrationFingerprint() can't
 * remove it), so the same recurring lender fingerprinted differently every
 * month and never reached the recurring-debt threshold.
 * narration-detail-parser.ts's own structural ACH-DR/UPI/IMPS/NEFT parsing
 * already isolates the stable counterparty name — reusing it here fixes
 * the clustering without a second, narrower one-off regex heuristic.
 */
export function groupByNarrationFingerprint(transactions: NormalizedTransactionInput[]): Map<string, NormalizedTransactionInput[]> {
  const groups = new Map<string, NormalizedTransactionInput[]>()
  for (const txn of transactions) {
    const key = narrationFingerprint(txn.narrationDetail?.counterpartyRaw || txn.narration)
    if (!key) continue // an empty fingerprint (no alphabetic content at all) can't be meaningfully clustered
    const existing = groups.get(key)
    if (existing) existing.push(txn)
    else groups.set(key, [txn])
  }
  return groups
}
