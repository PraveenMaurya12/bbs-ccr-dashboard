import { detectP2PCounterparties } from './p2p-detector'
import { txn } from './test-helpers'

function p2p(overrides: Parameters<typeof txn>[0] = {}) {
  return txn({ category: 'TRANSFERS', subcategory: 'P2P transfer', ...overrides })
}

describe('detectP2PCounterparties', () => {
  it('extracts a UPI VPA counterparty and marks it recurring at 3+ occurrences', () => {
    const result = detectP2PCounterparties([
      p2p({ narration: 'UPI/raviK99@okaxis/transfer', transactionDate: new Date(Date.UTC(2026, 0, 1)) }),
      p2p({ narration: 'UPI/raviK99@okaxis/transfer', transactionDate: new Date(Date.UTC(2026, 1, 1)) }),
      p2p({ narration: 'UPI/raviK99@okaxis/transfer', transactionDate: new Date(Date.UTC(2026, 2, 1)) }),
    ])
    expect(result.counterparties).toHaveLength(1)
    expect(result.counterparties[0]).toMatchObject({ counterparty: 'ravik99@okaxis', occurrences: 3, recurring: true })
  })

  it('never force-classifies a counterparty with fewer than 3 occurrences — reports it as part of unclassifiedP2pCount instead', () => {
    const result = detectP2PCounterparties([
      p2p({ narration: 'UPI/onetime@okhdfc/transfer' }),
      p2p({ narration: 'UPI/onetime@okhdfc/transfer' }),
    ])
    expect(result.counterparties[0].recurring).toBe(false)
    expect(result.unclassifiedP2pCount).toBe(2)
  })

  it('leaves a P2P transfer with no identifiable counterparty (generic UPI reference) uncounted but flagged in unclassifiedP2pCount', () => {
    const result = detectP2PCounterparties([p2p({ narration: 'UPI/9000010001/transfer' })])
    expect(result.counterparties).toHaveLength(0)
    expect(result.unclassifiedP2pCount).toBe(1)
  })

  it('never extracts a counterparty from an ALL-CAPS corporate narration (not a person)', () => {
    const result = detectP2PCounterparties([p2p({ narration: 'UPI/XYZ ENTERPRISES PVT LTD/transfer' })])
    expect(result.counterparties).toHaveLength(0)
  })

  it('ignores transactions outside the TRANSFERS/P2P transfer category entirely', () => {
    const result = detectP2PCounterparties([txn({ narration: 'UPI/raviK99@okaxis/transfer', category: 'EXPENSE', subcategory: 'EMI' })])
    expect(result.counterparties).toHaveLength(0)
    expect(result.unclassifiedP2pCount).toBe(0)
  })
})
