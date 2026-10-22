import { buildChangeSummary } from './change-summary'

describe('buildChangeSummary (v3.0 §19.3/§19.6)', () => {
  it('returns null when nothing material changed', () => {
    const result = buildChangeSummary({ cohort: 'C3', pathway: 'RESTRUCTURE', templateId: 'TPL_RESTRUCTURE_v1' }, { cohort: 'C3', pathway: 'RESTRUCTURE', templateId: 'TPL_RESTRUCTURE_v1' })
    expect(result).toBeNull()
  })

  it('CRITICAL: flags a pathway change as HIGH materiality', () => {
    const result = buildChangeSummary({ cohort: 'C3', pathway: 'RESTRUCTURE', templateId: 'TPL_RESTRUCTURE_v1' }, { cohort: 'C3', pathway: 'CONSOLIDATE', templateId: 'TPL_CONSOLIDATE_v1' })
    expect(result?.materiality).toBe('HIGH')
    expect(result?.changes).toEqual(expect.arrayContaining([{ field: 'pathway', from: 'RESTRUCTURE', to: 'CONSOLIDATE' }, { field: 'templateId', from: 'TPL_RESTRUCTURE_v1', to: 'TPL_CONSOLIDATE_v1' }]))
  })

  it('flags a cohort-only change (pathway/template unchanged) as MEDIUM materiality', () => {
    const result = buildChangeSummary({ cohort: 'C3', pathway: 'RESTRUCTURE', templateId: 'TPL_RESTRUCTURE_v1' }, { cohort: 'C4', pathway: 'RESTRUCTURE', templateId: 'TPL_RESTRUCTURE_v1' })
    expect(result?.materiality).toBe('MEDIUM')
    expect(result?.changes).toEqual([{ field: 'cohort', from: 'C3', to: 'C4' }])
  })
})
