import { compareCcrDeclared, type CcrDeclaredFacts } from './ccr-declared'

const declared = (over: Partial<CcrDeclaredFacts> = {}): CcrDeclaredFacts => ({ monthlyIncome: null, essentialExpenses: null, monthlyEmi: null, canServiceEmis: null, submittedAt: '2026-10-22T00:00:00.000Z', ...over })

describe('compareCcrDeclared', () => {
  const observed = { avgMonthlyIncome: 50000, avgEssentialExpenses: 20000, bureauMonthlyEmi: 10000 }

  it('reports nothing when declared values are within tolerance of observed ones', () => {
    expect(compareCcrDeclared(declared({ monthlyIncome: 55000, essentialExpenses: 22000, monthlyEmi: 11000, canServiceEmis: true }), observed)).toEqual([])
  })

  it('flags income, expenses and EMI that diverge by more than 25%', () => {
    const items = compareCcrDeclared(declared({ monthlyIncome: 90000, essentialExpenses: 5000, monthlyEmi: 30000 }), observed)
    expect(items.map((i) => i.item)).toEqual([
      'CCR-declared income differs from bank-observed income',
      'CCR-declared essential expenses differ from bank-observed expenses',
      'CCR-declared EMI total differs from bureau-reported EMI',
    ])
    expect(items[0].why).toContain('neither value was overwritten'.replace('neither', 'Neither'))
  })

  it('flags a customer who says they cannot service their EMIs', () => {
    expect(compareCcrDeclared(declared({ canServiceEmis: false }), observed).map((i) => i.item)).toEqual(['Customer reports difficulty servicing current EMIs'])
  })

  it('never invents a conflict when either side of a comparison is missing', () => {
    expect(compareCcrDeclared(declared({ monthlyIncome: 90000 }), { avgMonthlyIncome: null, avgEssentialExpenses: null, bureauMonthlyEmi: null })).toEqual([])
    expect(compareCcrDeclared(declared(), observed)).toEqual([])
  })
})
