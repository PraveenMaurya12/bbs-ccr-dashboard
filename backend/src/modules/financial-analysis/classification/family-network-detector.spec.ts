import { detectFamilyNetwork } from './family-network-detector'
import type { P2PCounterpartySummary } from './p2p-detector'

function counterparty(overrides: Partial<P2PCounterpartySummary> = {}): P2PCounterpartySummary {
  return { counterparty: 'Yogita Anupkumar Suth', occurrences: 5, recurring: true, trend: 'stable', totalInflow: 50000, totalOutflow: 0, ...overrides }
}

describe('detectFamilyNetwork', () => {
  it('classifies a recurring, personal-name, bidirectional, surname-matching counterparty as HIGH confidence (4 signals)', () => {
    const result = detectFamilyNetwork(
      [counterparty({ counterparty: 'Pradeep Motilal Maurya', totalInflow: 10000, totalOutflow: 30000 })],
      'Praveenkumar Motilal Maurya',
    )
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('HIGH')
    expect(result[0].signalCount).toBe(4)
  })

  it('classifies a recurring, personal-name, bidirectional counterparty with no surname match as MEDIUM confidence (3 signals)', () => {
    const result = detectFamilyNetwork([counterparty({ totalInflow: 30000, totalOutflow: 10000 })], 'Praveenkumar Motilal Maurya')
    expect(result[0].confidence).toBe('MEDIUM')
    expect(result[0].signalCount).toBe(3)
  })

  it('does not classify a counterparty with only 2 signals (recurring + personal name, one-directional, no surname match)', () => {
    const result = detectFamilyNetwork([counterparty({ totalInflow: 30000, totalOutflow: 0 })], 'Someone Else Entirely')
    expect(result).toHaveLength(0)
  })

  it('never classifies a business-named counterparty, even if recurring and bidirectional', () => {
    const result = detectFamilyNetwork([counterparty({ counterparty: 'Shreeji Enterprises', totalInflow: 50000, totalOutflow: 20000 })], null)
    expect(result).toHaveLength(0)
  })

  it('never classifies a VPA-style counterparty (not a personal-name pattern)', () => {
    const result = detectFamilyNetwork([counterparty({ counterparty: 'ravi@okaxis', totalInflow: 50000, totalOutflow: 20000 })], null)
    expect(result).toHaveLength(0)
  })

  it('computes net flow and direction correctly', () => {
    const result = detectFamilyNetwork([counterparty({ totalInflow: 50000, totalOutflow: 0 })], 'Yogita Anupkumar Suth')
    expect(result[0].netFlow).toBe(50000)
    expect(result[0].direction).toBe('INBOUND')
  })

  it('works (surname signal simply unavailable) when no account holder name is passed', () => {
    const result = detectFamilyNetwork([counterparty({ totalInflow: 30000, totalOutflow: 10000 })], null)
    expect(result[0].signals.surnameMatch).toBe(false)
    expect(result[0].confidence).toBe('MEDIUM')
  })
})
