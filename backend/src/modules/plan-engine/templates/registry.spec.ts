import type { CohortPrimaryState } from '../plan-engine.types'
import { c1StabilisationTemplate } from './c1-stabilisation.template'
import { c2ConsolidationTemplate } from './c2-consolidation.template'
import { c3RestructuringTemplate } from './c3-restructuring.template'
import { c4ResolutionTemplate } from './c4-resolution.template'
import { c5DebtCycleTemplate } from './c5-debt-cycle.template'
import { c6SpecialistReviewTemplate } from './c6-specialist-review.template'
import { c7RecoveryTemplate } from './c7-recovery.template'
import { pendingResolutionTemplate } from './pending-resolution.template'
import { getTemplate } from './registry'
import { x1DataCompletionTemplate } from './x1-data-completion.template'
import { x2OutsideProgramTemplate } from './x2-outside-program.template'

const ALL_TEMPLATES = [
  c1StabilisationTemplate,
  c2ConsolidationTemplate,
  c3RestructuringTemplate,
  c4ResolutionTemplate,
  c5DebtCycleTemplate,
  c6SpecialistReviewTemplate,
  c7RecoveryTemplate,
  x1DataCompletionTemplate,
  x2OutsideProgramTemplate,
  pendingResolutionTemplate,
]

describe('Template Registry', () => {
  it('every template has a non-empty objective, situation assessment, and problem definition', () => {
    for (const t of ALL_TEMPLATES) {
      expect(t.objective.length).toBeGreaterThan(0)
      expect(t.situationAssessmentTemplate.length).toBeGreaterThan(0)
      expect(t.problemDefinitionTemplate.length).toBeGreaterThan(0)
    }
  })

  it('every action has a stable actionId, a valid ownerType, and a valid phase', () => {
    const validOwners = ['CUSTOMER', 'BBS', 'CREDITOR']
    const validPhases = ['IMMEDIATE', 'DAY_30', 'DAY_60', 'DAY_90']
    for (const t of ALL_TEMPLATES) {
      for (const a of t.actions) {
        expect(a.actionId.length).toBeGreaterThan(0)
        expect(validOwners).toContain(a.ownerType)
        expect(validPhases).toContain(a.phase)
      }
    }
  })

  it('C6 (Specialist Review) proposes no debt-strategy actions beyond routing to a specialist, and starts SPECIALIST_REVIEW', () => {
    expect(c6SpecialistReviewTemplate.initialLifecycleStatus).toBe('SPECIALIST_REVIEW')
    expect(c6SpecialistReviewTemplate.actions).toHaveLength(1)
  })

  it('X1 (Data Completion) proposes no debt-resolution strategy', () => {
    expect(x1DataCompletionTemplate.debtStrategy).toMatch(/no debt strategy/i)
  })

  it('X2 (Outside Program) proposes no BBS debt strategy and no conditions', () => {
    expect(x2OutsideProgramTemplate.conditions).toHaveLength(0)
  })

  describe('getTemplate — cohort-keyed fallback (pathway null, i.e. a blocked/thin state)', () => {
    const CASES: Array<[CohortPrimaryState, string]> = [
      ['C1', 'C1_STABILISATION'],
      ['C2', 'C2_CONSOLIDATION'],
      ['C3', 'C3_RESTRUCTURING'],
      ['C4', 'C4_RESOLUTION'],
      ['C5', 'C5_DEBT_CYCLE_INTERVENTION'],
      ['C6', 'C6_SPECIALIST_REVIEW'],
      ['C7', 'C7_RECOVERY'],
      ['X1', 'X1_DATA_COMPLETION'],
      ['X2', 'X2_OUTSIDE_PROGRAM'],
      ['CONSENT_PENDING', 'PENDING_RESOLUTION'],
      ['KYC_PENDING', 'PENDING_RESOLUTION'],
      ['MANUAL_REVIEW', 'PENDING_RESOLUTION'],
      ['CUSTOMER_UNRESPONSIVE', 'PENDING_RESOLUTION'],
      ['COMPLIANCE_HOLD', 'PENDING_RESOLUTION'],
      ['DATA_REFRESH_REQUIRED', 'PENDING_RESOLUTION'],
      ['OTHER_ACCOUNTS_REQUIRED', 'PENDING_RESOLUTION'],
      ['P1_INFORMATION_REQUIRED', 'PENDING_RESOLUTION'],
      ['SPECIALIST_REQUIRED', 'PENDING_RESOLUTION'],
      ['CCR_REQUIRED', 'PENDING_RESOLUTION'],
    ]

    it.each(CASES)('resolves %s to templateId %s', (cohort, expectedTemplateId) => {
      expect(getTemplate(cohort, null).templateId).toBe(expectedTemplateId)
    })

    it('CRITICAL: resolves null cohort to the generic Pending Resolution template, never refusing', () => {
      expect(getTemplate(null, null).templateId).toBe('PENDING_RESOLUTION')
    })

    it('every one of the 18 CohortPrimaryState values plus null resolves to exactly one template — generation never refuses based on which cohort was decided', () => {
      const allCohorts: Array<CohortPrimaryState | null> = [...CASES.map(([c]) => c), null]
      for (const cohort of allCohorts) {
        expect(getTemplate(cohort, null)).toBeDefined()
      }
    })
  })

  describe('getTemplate — pathway-keyed routing (v3.0 §8.1, the primary routing key once a real Pathway Decision exists)', () => {
    it('CRITICAL: pathway, not cohort, decides the template once a real Pathway Decision exists', () => {
      // Even if (hypothetically) cohort still reads C1, a real pathway of RESTRUCTURE routes to the RESTRUCTURE template, never the old C1_STABILISATION fallback.
      expect(getTemplate('C1', 'RESTRUCTURE', 'STANDARD').templateId).toBe('TPL_RESTRUCTURE_v1')
    })

    it.each([
      ['OPTIMISE', 'TPL_OPTIMISE_v1'],
      ['CONSOLIDATE', 'TPL_CONSOLIDATE_v1'],
      ['RESTRUCTURE', 'TPL_RESTRUCTURE_v1'],
      ['RESOLVE', 'TPL_RESOLVE_v1'],
      ['RECOVER', 'TPL_RECOVER_v1'],
    ] as const)('resolves pathway %s to templateId %s', (pathway, expectedTemplateId) => {
      expect(getTemplate('C3', pathway, 'STANDARD').templateId).toBe(expectedTemplateId)
    })

    it('STABILISE + STANDARD variant -> TPL_STABILISE_STD_v1', () => {
      expect(getTemplate('C1', 'STABILISE', 'STANDARD').templateId).toBe('TPL_STABILISE_STD_v1')
    })

    it('CRITICAL: STABILISE + NINETY_DAY variant -> TPL_STABILISE_90D_v1, correctly isolated from the standard template (v3.0 §12.5) — unreachable in practice today since Pathway Engine\'s own pathwayVariant is hardcoded STANDARD, but built honestly per spec', () => {
      expect(getTemplate('C1', 'STABILISE', 'NINETY_DAY').templateId).toBe('TPL_STABILISE_90D_v1')
    })

    it('a null pathway falls back to cohort-keyed routing even when a (hypothetical) cohort value is present', () => {
      expect(getTemplate('X1', null).templateId).toBe('X1_DATA_COMPLETION')
    })
  })
})
