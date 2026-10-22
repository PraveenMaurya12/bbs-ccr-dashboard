import { getRefreshTrigger, inspectRefreshTriggers, REFRESH_TRIGGER_TAXONOMY, type RefreshTriggerId } from './refresh-triggers'

describe('refresh-triggers (v3.0 §15.1 taxonomy)', () => {
  it('enumerates exactly the 6 triggers the spec names, each with its own §15.1 layer-rerun order', () => {
    expect(REFRESH_TRIGGER_TAXONOMY).toHaveLength(6)
    const byId = Object.fromEntries(REFRESH_TRIGGER_TAXONOMY.map((t) => [t.id, t]))

    expect(byId.NEW_BANK_STATEMENT.layersRerun).toEqual(['L2_FINANCIAL_ANALYSIS', 'L3_MASTER_PROFILE', 'L4_COHORT_DECISION'])
    expect(byId.NEW_BUREAU_PULL.layersRerun).toEqual(['L1_DEBT_ANALYSIS', 'L3_MASTER_PROFILE', 'L4_COHORT_DECISION'])
    expect(byId.CCR_DISCOVERY_COMPLETE.layersRerun).toEqual(['L3_MASTER_PROFILE', 'L4_COHORT_DECISION'])
    expect(byId.COMPLIANCE_CLEARED.layersRerun).toEqual(['L4_COHORT_DECISION'])
    expect(byId.POLICY_CHANGE.layersRerun).toEqual(['L4_COHORT_DECISION'])
    expect(byId.MATERIAL_EVENT.layersRerun).toEqual(['L3_MASTER_PROFILE', 'L4_COHORT_DECISION'])
  })

  it('every trigger has a non-empty requiredConditions, affectedAssessment, and expectedReevaluationBehavior', () => {
    for (const t of REFRESH_TRIGGER_TAXONOMY) {
      expect(t.requiredConditions.length).toBeGreaterThan(10)
      expect(t.affectedAssessment.length).toBeGreaterThan(5)
      expect(t.expectedReevaluationBehavior.length).toBeGreaterThan(10)
      expect(t.detectionNote.length).toBeGreaterThan(10)
    }
  })

  it('honestly marks POLICY_CHANGE as not mechanically detectable, and the other 5 as detectable', () => {
    const notDetectable = REFRESH_TRIGGER_TAXONOMY.filter((t) => !t.mechanicallyDetectable).map((t) => t.id)
    expect(notDetectable).toEqual(['POLICY_CHANGE'])
  })

  it('getRefreshTrigger looks up a single trigger by id and throws on an unknown id', () => {
    expect(getRefreshTrigger('COMPLIANCE_CLEARED').label).toBe('Compliance cleared')
    expect(() => getRefreshTrigger('NOT_A_REAL_TRIGGER' as RefreshTriggerId)).toThrow()
  })

  describe('inspectRefreshTriggers — per-lead applicability', () => {
    const baseDecision = { complianceHold: false, complianceClearedAt: null, complianceDeclinedAt: null, sourceMasterProfileVersion: 3 }

    it('NEW_BANK_STATEMENT/NEW_BUREAU_PULL/CCR_DISCOVERY_COMPLETE/MATERIAL_EVENT are all jointly satisfied when Master Profile has moved past this decision\'s source version — and honestly indistinguishable from each other', () => {
      const results = inspectRefreshTriggers({ decision: baseDecision, currentMasterProfileVersion: 4 })
      const layerTriggered: RefreshTriggerId[] = ['NEW_BANK_STATEMENT', 'NEW_BUREAU_PULL', 'CCR_DISCOVERY_COMPLETE', 'MATERIAL_EVENT']
      for (const id of layerTriggered) {
        const r = results.find((t) => t.id === id)!
        expect(r.currentlyApplicable).toBe(true)
      }
    })

    it('NEW_BANK_STATEMENT/NEW_BUREAU_PULL/CCR_DISCOVERY_COMPLETE/MATERIAL_EVENT are all NOT applicable when Master Profile version is unchanged', () => {
      const results = inspectRefreshTriggers({ decision: baseDecision, currentMasterProfileVersion: 3 })
      const layerTriggered: RefreshTriggerId[] = ['NEW_BANK_STATEMENT', 'NEW_BUREAU_PULL', 'CCR_DISCOVERY_COMPLETE', 'MATERIAL_EVENT']
      for (const id of layerTriggered) {
        const r = results.find((t) => t.id === id)!
        expect(r.currentlyApplicable).toBe(false)
      }
    })

    it('COMPLIANCE_CLEARED is applicable only when an active, unresolved compliance hold exists', () => {
      const withHold = inspectRefreshTriggers({ decision: { ...baseDecision, complianceHold: true }, currentMasterProfileVersion: 3 })
      expect(withHold.find((t) => t.id === 'COMPLIANCE_CLEARED')!.currentlyApplicable).toBe(true)

      const noHold = inspectRefreshTriggers({ decision: baseDecision, currentMasterProfileVersion: 3 })
      expect(noHold.find((t) => t.id === 'COMPLIANCE_CLEARED')!.currentlyApplicable).toBe(false)

      const alreadyCleared = inspectRefreshTriggers({ decision: { ...baseDecision, complianceHold: true, complianceClearedAt: new Date() }, currentMasterProfileVersion: 3 })
      expect(alreadyCleared.find((t) => t.id === 'COMPLIANCE_CLEARED')!.currentlyApplicable).toBe(false)

      const alreadyDeclined = inspectRefreshTriggers({ decision: { ...baseDecision, complianceHold: true, complianceDeclinedAt: new Date() }, currentMasterProfileVersion: 3 })
      expect(alreadyDeclined.find((t) => t.id === 'COMPLIANCE_CLEARED')!.currentlyApplicable).toBe(false)
    })

    it('POLICY_CHANGE is never currentlyApplicable, regardless of input — it is never mechanically determinable', () => {
      const results = inspectRefreshTriggers({ decision: { ...baseDecision, complianceHold: true }, currentMasterProfileVersion: 999 })
      expect(results.find((t) => t.id === 'POLICY_CHANGE')!.currentlyApplicable).toBe(false)
    })

    it('handles a null currentMasterProfileVersion (e.g. Master Profile no longer available) without throwing, treating it as not-moved', () => {
      const results = inspectRefreshTriggers({ decision: baseDecision, currentMasterProfileVersion: null })
      expect(results.find((t) => t.id === 'MATERIAL_EVENT')!.currentlyApplicable).toBe(false)
    })
  })
})
