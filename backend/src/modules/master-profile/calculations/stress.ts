import type { DebtAnalysisFacts, FinancialAnalysisFacts, MasterConfidenceLevel, StressProfileResult } from '../master-profile.types'

const DEBT_LEVEL_WEIGHT: Record<DebtAnalysisFacts['stressLevel'], number> = { Stable: 0, Attention: 1, 'High Attention': 2, Critical: 3 }
const FINANCIAL_BAND_WEIGHT: Record<FinancialAnalysisFacts['stressBand'], number> = { LOW: 0, MODERATE: 1, ELEVATED: 1, HIGH: 2, CRITICAL: 3 }

/**
 * Spec Part 14/15: a Master Stress Profile combining Debt Analysis's own
 * `stressAnalysis.{level,signals}` with Financial Analysis's own
 * `score.stressIndicator0to100`/`stressBand` and relevant risk flags —
 * neither module's stress computation is redone here, only combined.
 * Financial Health Score and Financial Stress Indicator remain
 * structurally separate throughout this module too, per the spec's own
 * repeated instruction never to sum them into one number.
 */
export function synthesizeFinancialStress(debt: Pick<DebtAnalysisFacts, 'stressLevel' | 'stressSignals'>, financial: Pick<FinancialAnalysisFacts, 'stressBand' | 'stressIndicator0to100' | 'riskFlags'>): StressProfileResult {
  const drivers: string[] = []

  if (debt.stressLevel !== 'Stable') drivers.push(...debt.stressSignals)
  const attentionFlags = financial.riskFlags.filter((f) => f.severity === 'ATTENTION' || f.severity === 'ELEVATED' || f.severity === 'CRITICAL')
  drivers.push(...attentionFlags.map((f) => f.detail))

  if (drivers.length === 0) {
    drivers.push('No elevated stress signal was identified from either the credit report or the bank statement.')
  }

  const combinedWeight = DEBT_LEVEL_WEIGHT[debt.stressLevel] + FINANCIAL_BAND_WEIGHT[financial.stressBand]
  let level: StressProfileResult['level']
  if (combinedWeight >= 5) level = 'Critical'
  else if (combinedWeight >= 3) level = 'High Attention'
  else if (combinedWeight >= 1) level = 'Attention'
  else level = 'Stable'

  // HIGH when both modules independently point the same direction (both
  // elevated, or both stable) — MEDIUM when only one module shows stress —
  // never LOW here, since both inputs are always deterministic/available
  // whenever this function runs (both upstream modules are COMPLETED).
  const bothElevated = debt.stressLevel !== 'Stable' && (financial.stressBand === 'ELEVATED' || financial.stressBand === 'HIGH' || financial.stressBand === 'CRITICAL')
  const bothStable = debt.stressLevel === 'Stable' && (financial.stressBand === 'LOW' || financial.stressBand === 'MODERATE')
  const confidence: MasterConfidenceLevel = bothElevated || bothStable ? 'HIGH' : 'MEDIUM'

  return { level, drivers, confidence }
}
