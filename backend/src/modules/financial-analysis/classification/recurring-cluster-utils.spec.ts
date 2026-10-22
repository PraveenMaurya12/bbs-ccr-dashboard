import { txn } from './test-helpers'
import { groupByNarrationFingerprint, mergeTruncatedCounterpartyGroups, narrationFingerprint } from './recurring-cluster-utils'

describe('narrationFingerprint — month-name normalization regression', () => {
  // A. The exact real-customer sequence that motivated this fix.
  it('A. "Salary for the Month of Nov/Dec/Jan/Feb" all fingerprint identically', () => {
    const fingerprints = [
      'Salary for the Month of Nov',
      'Salary for the Month of Dec',
      'Salary for the Month of Jan',
      'Salary for the Month of Feb',
    ].map(narrationFingerprint)
    expect(new Set(fingerprints).size).toBe(1)
  })

  // B. Full month names.
  it('B. full month names normalize the same as their abbreviations', () => {
    expect(narrationFingerprint('Salary for November')).toBe(narrationFingerprint('Salary for Nov'))
    expect(narrationFingerprint('Salary for January')).toBe(narrationFingerprint('Salary for Jan'))
  })

  // C. Abbreviated month names across the full set.
  it('C. every standard month abbreviation is recognized', () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const fingerprints = months.map((m) => narrationFingerprint(`Salary for the Month of ${m}`))
    expect(new Set(fingerprints).size).toBe(1)
  })

  // D. Mixed full/abbreviated.
  it('D. a mix of full names and abbreviations across the same employer still cluster identically', () => {
    const fingerprints = ['Salary for the Month of November', 'Salary for the Month of Dec', 'Salary for the Month of January', 'Salary for the Month of Feb'].map(
      narrationFingerprint,
    )
    expect(new Set(fingerprints).size).toBe(1)
  })

  // E. Case variations.
  it('E. month-name matching is case-insensitive', () => {
    const fingerprints = ['SALARY FOR NOV', 'salary for nov', 'Salary For NOV', 'Salary for nOv'].map(narrationFingerprint)
    expect(new Set(fingerprints).size).toBe(1)
  })

  // F. Different employers must remain different fingerprints.
  it('F. two different employers never collapse into one fingerprint merely because both mention a month', () => {
    const abc = narrationFingerprint('Salary for the Month of Nov ABC Corp')
    const xyz = narrationFingerprint('Salary for the Month of Nov XYZ Ltd')
    expect(abc).not.toBe(xyz)
  })

  // G. Different income sources (not just different employers) stay separate.
  it('G. "Salary ABC Ltd" and "Salary XYZ Ltd" remain separate fingerprints', () => {
    expect(narrationFingerprint('Salary ABC Ltd')).not.toBe(narrationFingerprint('Salary XYZ Ltd'))
  })

  it('G. a genuine month-name false-positive risk ("May") still correctly distinguishes unrelated narrations by their other tokens', () => {
    // "May" is itself an ordinary English word — confirm this doesn't
    // collapse two otherwise-unrelated narrations that happen to both
    // contain it into the same source.
    const rentMay = narrationFingerprint('Rent payment may vary ABC Properties')
    const salaryMay = narrationFingerprint('Salary for the Month of May')
    expect(rentMay).not.toBe(salaryMay)
  })

  // H. Digit/reference-number stripping still works alongside the new month strip.
  it('H. long reference numbers still normalize away exactly as before, even with a month name present', () => {
    const a = narrationFingerprint('SALARY CREDIT ABC CORP REF00123456 for Nov')
    const b = narrationFingerprint('SALARY CREDIT ABC CORP REF00789012 for Dec')
    expect(a).toBe(b)
  })

  it('does not strip a month-like substring that is part of a longer unrelated word (word-boundary safety)', () => {
    // "december" must match as a whole word; a word merely CONTAINING a
    // month-like substring at a non-boundary position must not be gutted.
    expect(narrationFingerprint('Decentralized Payment Services')).toContain('decentralized')
  })
})

describe('groupByNarrationFingerprint — ACH-DR mandate-reference regression', () => {
  // CRITICAL: confirmed against a real statement — an ACH-DR auto-debit's
  // trailing mandate reference ("INCREDXOgEpcpjhlYacA-") is a DIFFERENT
  // random alphanumeric string every month. It is not a clean 4+ digit run,
  // so narrationFingerprint()'s own \d{4,} strip can't remove it, and the
  // raw narration fingerprints differently every month — the same genuinely
  // recurring EMI never reached the recurring-debt-detector's threshold.
  it('CRITICAL: clusters the same ACH-DR lender across months despite a different mandate reference each time', () => {
    const narrations = [
      'ACH-DR-INCRED FINANCIAL SER-INCREDXOgEpcpjhlYacA-',
      'ACH-DR-INCRED FINANCIAL SER-INCREDNdvRlK6BgyFp8N-',
      'ACH-DR-INCRED FINANCIAL SER-INCREDf2CqUQjX4F3xA6-',
    ]
    const transactions = narrations.map((narration) =>
      txn({
        narration,
        direction: 'DEBIT',
        amount: 6209,
        narrationDetail: { referenceNumber: 'whatever', counterpartyRaw: 'INCRED FINANCIAL SER', purpose: null, counterpartyBank: null },
      }),
    )
    const groups = groupByNarrationFingerprint(transactions)
    expect(groups.size).toBe(1)
    expect([...groups.values()][0]).toHaveLength(3)
  })

  it('falls back to the raw narration when narrationDetail was never parsed (unsupported statement format)', () => {
    const transactions = [txn({ narration: 'SALARY ABC CORP', narrationDetail: null }), txn({ narration: 'SALARY XYZ LTD', narrationDetail: null })]
    const groups = groupByNarrationFingerprint(transactions)
    expect(groups.size).toBe(2)
  })
})

describe('mergeTruncatedCounterpartyGroups — cross-rail employer continuity', () => {
  function group(counterpartyRaw: string, narration: string) {
    return [txn({ narration, narrationDetail: { referenceNumber: '1', counterpartyRaw, purpose: null, counterpartyBank: null } })]
  }

  it("CRITICAL: merges a real employer's IMPS-truncated name (\"GOLDENLE\") with its NEFT-truncated name (\"GOLDEN LEGAND LEASING AND FI\") — same employer, different rail truncation", () => {
    const imps = group('GOLDENLE', 'IMPS/P2A/1/GOLDENLE/AUSMALLF/Salaryfo/123')
    const neft = group('GOLDEN LEGAND LEASING AND FI', 'NEFT/1/GOLDEN LEGAND LEASING AND FI/AU SMALL FINANCE BAN/2')
    const groups = groupByNarrationFingerprint([...imps, ...neft])
    expect(groups.size).toBe(2) // confirmed NOT merged by fingerprint alone
    const merged = mergeTruncatedCounterpartyGroups(groups)
    expect(merged.size).toBe(1)
    expect([...merged.values()][0]).toHaveLength(2)
  })

  it('does NOT merge two unrelated payers that merely share a short, generic opening ("RAM" vs "RAMESH ENTERPRISES")', () => {
    const a = group('RAM', 'UPI/P2A/1/RAM/NA/bank')
    const b = group('RAMESH ENTERPRISES', 'UPI/P2A/2/RAMESH ENTERPRISES/NA/bank')
    const merged = mergeTruncatedCounterpartyGroups(groupByNarrationFingerprint([...a, ...b]))
    expect(merged.size).toBe(2)
  })

  it('does NOT merge two unrelated payers whose names happen to share only a short prefix below the minimum length', () => {
    const a = group('SBI', 'UPI/P2A/1/SBI/NA/bank')
    const b = group('SBICARD PAYMENTS LTD', 'UPI/P2A/2/SBICARD PAYMENTS LTD/NA/bank')
    const merged = mergeTruncatedCounterpartyGroups(groupByNarrationFingerprint([...a, ...b]))
    expect(merged.size).toBe(2)
  })

  it('does not merge two genuinely different, similarly-long employer names (no prefix relationship)', () => {
    const a = group('AEREM SOLUTIONS PVT LTD', 'NEFT/1/AEREM SOLUTIONS PVT LTD/BANK/2')
    const b = group('GOLDEN LEGAND LEASING AND FI', 'NEFT/2/GOLDEN LEGAND LEASING AND FI/BANK/3')
    const merged = mergeTruncatedCounterpartyGroups(groupByNarrationFingerprint([...a, ...b]))
    expect(merged.size).toBe(2)
  })
})
