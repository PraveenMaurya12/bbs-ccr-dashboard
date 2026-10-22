import type { PathwayInput, PathwayRuleResultOutput } from '../pathway-engine.types'
import { p001GateAndBlockInheritance, p002CohortToPathwayMapping, p003CapacityBandToPathway, p005FcfReconciliationGate, p015ExceptionCountThreshold, p016P1MissingInfoThreshold } from './rules'
import { testConfig } from './test-helpers'

/**
 * Test-only replica of `PathwayEngineService`'s own preliminary-rule
 * sequence (the subset `resolvePathwayPrecedence()` actually reads:
 * P005/P015/P016) — lets `precedence.spec.ts` exercise the real
 * precedence function against real rule-evaluation output, not a
 * hand-built results array.
 */
export function evaluateAllRulesForTest(input: PathwayInput, p1Threshold = 4): PathwayRuleResultOutput[] {
  const v = testConfig().ruleVersion
  const p001 = p001GateAndBlockInheritance(input, v)
  const p002 = p002CohortToPathwayMapping(input, p001, v)
  const p003 = p003CapacityBandToPathway(input, p001, v)
  const p005 = p005FcfReconciliationGate(input, v)
  const p015 = p015ExceptionCountThreshold(input, v)
  const p016 = p016P1MissingInfoThreshold(input, p1Threshold, v)
  return [p001, p002, p003, p005, p015, p016]
}
