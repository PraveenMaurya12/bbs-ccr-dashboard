import type { FinancialAnalysisInsights, FinancialAssessmentFindings, FinancialFinding } from '../../../types'

function isFindingArray(value: unknown): value is FinancialFinding[] {
  return (
    Array.isArray(value) &&
    value.every(
      (f) => f && typeof f === 'object' && typeof (f as Record<string, unknown>).title === 'string' && typeof (f as Record<string, unknown>).statement === 'string',
    )
  )
}

/**
 * Runtime guard, not a type assertion — same pattern as the Debt module's
 * aiFindings.ts. An AnalysisResult row written before this contract
 * existed (or by a future/older Gemini prompt version) would still have
 * some other shape; this never crashes on that, it returns null so the
 * caller can render an honest "insights predate this format" state instead
 * of a legacy-shaped panel pretending to be the new one.
 */
export function getFinancialAssessmentFindings(insights: FinancialAnalysisInsights | null): FinancialAssessmentFindings | null {
  if (!insights || insights.status !== 'COMPLETED' || !insights.findings) return null
  const f = insights.findings as Record<string, unknown>
  if (typeof f.executiveSummary !== 'string' || typeof f.financialPosition !== 'string') return null
  if (!isFindingArray(f.strengths) || !isFindingArray(f.concerns)) return null
  if (typeof f.overallAssessment !== 'object' || f.overallAssessment === null) return null
  return f as unknown as FinancialAssessmentFindings
}
