import type { CohortPathway, PathwayAlternative, PathwayInput } from '../pathway-engine.types'
import { ALL_PATHWAYS, evaluateSuitability } from './suitability'

const PATHWAY_PREFERENCE_ORDER: CohortPathway[] = ['OPTIMISE', 'STABILISE', 'CONSOLIDATE', 'RESTRUCTURE', 'RESOLVE', 'RECOVER']

/** Short, canned "what would need to change" phrasing per failed-condition name — §8.3's own `switch_trigger`/`reason_not_primary` fields are short phrases, not full sentences (see §8.4's own worked example). */
const CONDITION_PHRASING: Record<string, { reasonNotPrimary: string; switchTrigger: string }> = {
  'No current overdue': { reasonNotPrimary: 'Current overdue', switchTrigger: 'Overdue cleared' },
  'Acute distress resolved': { reasonNotPrimary: 'Current overdue', switchTrigger: 'Overdue cleared' },
  'Master DSR <= 40%': { reasonNotPrimary: 'DSR too high', switchTrigger: 'DSR reduced below 40%' },
  'Master DSR <= 50%': { reasonNotPrimary: 'DSR too high', switchTrigger: 'DSR reduced below 50%' },
  'Master DSR > 40%': { reasonNotPrimary: 'DSR not high enough to justify restructuring', switchTrigger: 'DSR rises above 40%' },
  'Lender restructuring option available': { reasonNotPrimary: 'No lender option', switchTrigger: 'Lender offers a restructuring option' },
  'Approved product available': { reasonNotPrimary: 'No approved product', switchTrigger: 'A consolidation product becomes available' },
  'FCF reconciled': { reasonNotPrimary: 'Free cash flow unreconciled', switchTrigger: 'Free cash flow is reconciled' },
  'No debt-cycle signals': { reasonNotPrimary: 'Debt-cycle signal present', switchTrigger: 'Debt-cycle signal clears' },
  'No compliance hold': { reasonNotPrimary: 'Compliance hold active', switchTrigger: 'Compliance hold clears' },
  'No compliance hold (or cleared)': { reasonNotPrimary: 'Compliance hold active', switchTrigger: 'Compliance hold clears' },
  'No P1 items': { reasonNotPrimary: 'P1 information outstanding', switchTrigger: 'P1 items resolved' },
  'No adverse statuses': { reasonNotPrimary: 'Adverse legal status present', switchTrigger: 'Legal status resolved' },
  'Capacity >= Tight': { reasonNotPrimary: 'Capacity too weak', switchTrigger: 'Capacity improves to Tight or better' },
  'Capacity band >= Tight': { reasonNotPrimary: 'Capacity too weak', switchTrigger: 'Capacity improves to Tight or better' },
  'Capacity in {Tight, Stressed}': { reasonNotPrimary: 'Capacity outside the Tight/Stressed range', switchTrigger: 'Capacity moves into the Tight/Stressed range' },
  'Capacity = Distressed': { reasonNotPrimary: 'Capacity is not Distressed', switchTrigger: 'Capacity deteriorates to Distressed' },
  '2+ eligible active obligations': { reasonNotPrimary: 'Fewer than 2 eligible obligations', switchTrigger: '2 or more eligible obligations exist' },
  'Distress signal OR overdue': { reasonNotPrimary: 'No distress signal or overdue present', switchTrigger: 'A distress signal or overdue amount appears' },
  'Legal/specialist review completed': { reasonNotPrimary: 'Legal/specialist review outstanding', switchTrigger: 'Legal/specialist review completes' },
  'Agreed repayment/resolution active': { reasonNotPrimary: 'No agreed repayment/resolution active', switchTrigger: 'A repayment/resolution arrangement becomes active' },
  'No critical blockers': { reasonNotPrimary: 'A critical blocker is present', switchTrigger: 'Critical blockers clear' },
  'Other standard pathways assessed': { reasonNotPrimary: 'Other pathways not yet assessed', switchTrigger: 'Other pathways are assessed and ruled out' },
}

function phrasingFor(conditionName: string): { reasonNotPrimary: string; switchTrigger: string } {
  return CONDITION_PHRASING[conditionName] ?? { reasonNotPrimary: conditionName, switchTrigger: `${conditionName} is met` }
}

/**
 * §8.2's own deterministic algorithm, verbatim: for every non-primary
 * pathway, evaluate its own §5.2 suitability conditions, score it, keep
 * it only if score >= 0.5, sort by score desc then pathway preference
 * order, return the top 3.
 */
export function computeAlternativePathways(primaryPathway: CohortPathway | null, input: PathwayInput): PathwayAlternative[] {
  const candidates: PathwayAlternative[] = []

  for (const pathway of ALL_PATHWAYS) {
    if (pathway === primaryPathway) continue
    const evaluation = evaluateSuitability(pathway, input)
    if (evaluation.suitabilityScore < 0.5) continue

    const metConditions = evaluation.conditions.filter((c) => c.status === 'MET').map((c) => c.condition)
    const failedConditions = evaluation.conditions.filter((c) => c.status === 'FAILED')
    const primaryBlocker = failedConditions[0]
    const phrasing = primaryBlocker ? phrasingFor(primaryBlocker.condition) : { reasonNotPrimary: 'Lower suitability score than the selected primary pathway.', switchTrigger: 'Primary pathway conditions change.' }

    candidates.push({
      pathway,
      suitabilityScore: Math.round(evaluation.suitabilityScore * 100) / 100,
      metConditions,
      blockingConditions: failedConditions.map((c) => c.condition),
      reasonNotPrimary: phrasing.reasonNotPrimary,
      switchTrigger: phrasing.switchTrigger,
    })
  }

  candidates.sort((a, b) => {
    if (b.suitabilityScore !== a.suitabilityScore) return b.suitabilityScore - a.suitabilityScore
    return PATHWAY_PREFERENCE_ORDER.indexOf(a.pathway) - PATHWAY_PREFERENCE_ORDER.indexOf(b.pathway)
  })

  return candidates.slice(0, 3)
}
