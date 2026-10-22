import type { NarrationDetail, NormalizedTransactionInput } from '../financial-analysis.types'

/**
 * v4.0 spec §3.8 "Bank Narration Parsing Specification" — canonical fields
 * (reference number, counterparty raw, purpose, counterparty bank) parsed
 * from the slash/dash-delimited narration formats the spec itself gives as
 * examples:
 *   UPI/P2M/545701768124/R CITY MALL/Paid v/BANK OF BARODA
 *   UPI/P2A/512116984809/PRAVEENKUMAR MOTILAL/NA/Kotak Mahindra Bank
 *   IMPS/P2A/510519628956/PERFIOSS/IDFCBank/BankAcco/9100000000919751001
 *   NEFT/ICIN412158875251/AEREM SOLUTIONS PRIVATE LIMITED/ICICI BANK
 *   ACH-DR-INCRED FINANCIAL SER-INCREDXOgEpcpjhlYacA-
 *   SB:924010040915717:Int.Pd:01-04-2025 to 30-06-2025
 *
 * Every field stays null when the narration doesn't match one of these
 * structural shapes — this is a structural slash/dash-token split, never a
 * best-effort guess (same D07 "never force uncertain evidence" discipline
 * as classifyTransaction). A bank that formats narrations differently
 * simply yields narrationDetail: null for every field, an honest gap
 * surfaced in the Missing Information Register rather than a fabricated
 * parse.
 */
export function parseNarrationDetail(narration: string): NarrationDetail {
  const empty: NarrationDetail = { referenceNumber: null, counterpartyRaw: null, purpose: null, counterpartyBank: null }
  const trimmed = narration.trim()

  // UPI/P2M|P2A/<refNo>/<counterparty>/<purpose>/<bank>
  const upiMatch = /^UPI\/(P2[MA])\/(\d+)\/([^/]*)\/([^/]*)\/(.*)$/i.exec(trimmed)
  if (upiMatch) {
    const [, , refNo, counterparty, purpose, bank] = upiMatch
    return {
      referenceNumber: refNo || null,
      counterpartyRaw: counterparty.trim() || null,
      purpose: purpose.trim() && purpose.trim().toUpperCase() !== 'NA' ? purpose.trim() : null,
      counterpartyBank: bank.trim() || null,
    }
  }

  // IMPS/{direction}/{reference}/{counterparty}/{bank_short}/{account_ref}/{account_number}
  // (spec Appendix B) — account_ref is a bank-truncated purpose-like code
  // (e.g. "Salaryfo" for "Salary for...", "DiwaliBo" for "Diwali Bonus",
  // "BankAcco" as the generic default for an ordinary account transfer) —
  // captured as `purpose` when present, never fabricated when absent.
  const impsMatch = /^IMPS\/(P2[MA])\/(\d+)\/([^/]*)\/([^/]*)(?:\/([^/]*))?\/?/i.exec(trimmed)
  if (impsMatch) {
    const [, , refNo, counterparty, bank, accountRef] = impsMatch
    return {
      referenceNumber: refNo || null,
      counterpartyRaw: counterparty.trim() || null,
      purpose: accountRef && accountRef.trim() ? accountRef.trim() : null,
      counterpartyBank: bank.trim() || null,
    }
  }

  // NEFT/<refNo>/<counterparty>/<bank>
  const neftMatch = /^NEFT\/([A-Z0-9]+)\/([^/]*)\/(.*)$/i.exec(trimmed)
  if (neftMatch) {
    const [, refNo, counterparty, bank] = neftMatch
    return { referenceNumber: refNo || null, counterpartyRaw: counterparty.trim() || null, purpose: null, counterpartyBank: bank.trim() || null }
  }

  // RTGS/<refNo>/<counterparty>/<bank>
  const rtgsMatch = /^RTGS\/([A-Z0-9]+)\/([^/]*)\/(.*)$/i.exec(trimmed)
  if (rtgsMatch) {
    const [, refNo, counterparty, bank] = rtgsMatch
    return { referenceNumber: refNo || null, counterpartyRaw: counterparty.trim() || null, purpose: null, counterpartyBank: bank.trim() || null }
  }

  // ACH-DR-<lender>-<mandateRef>- or ACH-CR-<lender>-<mandateRef>-
  const achMatch = /^ACH-(DR|CR)-([^-]*)-([^-]*)-?/i.exec(trimmed)
  if (achMatch) {
    const [, , lender, mandateRef] = achMatch
    return { referenceNumber: mandateRef || null, counterpartyRaw: lender.trim() || null, purpose: null, counterpartyBank: null }
  }

  // SB:<accountNumber>:<description...>
  const sbMatch = /^SB:(\d+):(.*)$/i.exec(trimmed)
  if (sbMatch) {
    const [, accountNumber, description] = sbMatch
    return { referenceNumber: accountNumber || null, counterpartyRaw: null, purpose: description.trim() || null, counterpartyBank: null }
  }

  return empty
}

export function parseAllNarrationDetails(transactions: NormalizedTransactionInput[]): NormalizedTransactionInput[] {
  return transactions.map((t) => (t.narrationDetail ? t : { ...t, narrationDetail: parseNarrationDetail(t.narration) }))
}
