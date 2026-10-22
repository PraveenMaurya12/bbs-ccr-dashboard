import { synthesizeFinancialStress } from './stress'
import type { DebtAnalysisFacts, FinancialAnalysisFacts } from '../master-profile.types'

function debt(overrides: Partial<Pick<DebtAnalysisFacts, 'stressLevel' | 'stressSignals'>> = {}): Pick<DebtAnalysisFacts, 'stressLevel' | 'stressSignals'> {
  return { stressLevel: 'Stable', stressSignals: [], ...overrides }
}

function financial(overrides: Partial<Pick<FinancialAnalysisFacts, 'stressBand' | 'stressIndicator0to100' | 'riskFlags'>> = {}): Pick<FinancialAnalysisFacts, 'stressBand' | 'stressIndicator0to100' | 'riskFlags'> {
  return { stressBand: 'LOW', stressIndicator0to100: 10, riskFlags: [], ...overrides }
}

describe('synthesizeFinancialStress', () => {
  it('reports Stable with HIGH confidence when both modules independently agree things are calm', () => {
    const result = synthesizeFinancialStress(debt(), financial())
    expect(result.level).toBe('Stable')
    expect(result.confidence).toBe('HIGH')
  })

  it('reports Critical with HIGH confidence when both modules independently show severe stress', () => {
    const result = synthesizeFinancialStress(
      debt({ stressLevel: 'Critical', stressSignals: ['Written-off account.'] }),
      financial({ stressBand: 'CRITICAL', riskFlags: [{ key: 'X', severity: 'CRITICAL', detail: 'Repeated bounces.', evidence: {}, relatedMonth: null }] }),
    )
    expect(result.level).toBe('Critical')
    expect(result.confidence).toBe('HIGH')
    expect(result.drivers).toEqual(expect.arrayContaining(['Written-off account.', 'Repeated bounces.']))
  })

  it('reports MEDIUM confidence when only one module shows stress (a contradiction worth flagging)', () => {
    const result = synthesizeFinancialStress(debt({ stressLevel: 'Attention', stressSignals: ['One overdue account.'] }), financial())
    expect(result.confidence).toBe('MEDIUM')
  })

  it('never combines Financial Health Score / Stress Indicator into this stress level — only uses the band', () => {
    const result = synthesizeFinancialStress(debt(), financial({ stressIndicator0to100: 95, stressBand: 'LOW' }))
    expect(result.level).toBe('Stable')
  })
})
