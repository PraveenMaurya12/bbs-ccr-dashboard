/**
 * The AI output contract for DEBT_ANALYSIS_INSIGHTS only — every other job
 * type still on the original flat `GeminiFindings` shape (L1_CREDIT_SCREENING,
 * L2_FINANCIAL_ANALYSIS, L3_ASSESSMENT) is untouched by this rebuild.
 * RECOVERY_PLAN_GENERATION has its own real contract too — see
 * bbs-plan-narrative.types.ts.
 *
 * Mirrors the BBS Debt Analysis Module spec's Layer 5 (Debt Diagnosis) and
 * Layer 6 (BBS Action Plan) output framework, and Rule 23's Known/Indicated/
 * Unknown root-cause distinction (`evidenceLevel` below). This is advisory
 * output only (see AnalysisResult's own doc comment in schema.prisma) — it
 * interprets the deterministic `buildDebtAnalysisSummary` numbers it is
 * given, it never becomes a second source of numerical truth.
 */
export type EvidenceLevel = 'KNOWN' | 'INDICATED' | 'UNKNOWN'

export interface DebtDiagnosisFinding {
  type: string
  severity: 'High' | 'Medium' | 'Low'
  title: string
  statement: string
  /** Short citations of the specific input figures this statement is grounded in — never a re-statement of the statement itself. */
  evidence: string[]
  /** Rule 23: KNOWN = directly supported by bureau/bank data; INDICATED = a pattern consistent with a possible driver; UNKNOWN = required evidence is not reported. */
  evidenceLevel: EvidenceLevel
  relatedAccounts: string[]
  confidence: 'high' | 'medium' | 'low'
}

export interface DebtDiagnosisActionPlan {
  verify: string[]
  immediateAttention: string[]
  monitor: string[]
  optimize: string[]
}

export interface DebtDiagnosisFindings {
  executiveSummary: string
  /** Layer 5 "Current position": the current repayment picture, using reported facts. */
  currentPosition: string
  /** Layer 5 "Primary concern": the largest evidence-supported structural issue. */
  primaryConcerns: DebtDiagnosisFinding[]
  /** Layer 5 "Secondary concern": the next material issue. */
  secondaryConcerns: DebtDiagnosisFinding[]
  /** Layer 5 "Historical context": material past delinquency/status events. */
  historicalContext: DebtDiagnosisFinding[]
  /** Layer 6 "Trajectory" — a plain sentence; honestly restates the deterministic `unavailable.trajectory` reason rather than inventing a trend (BBS stores one report per lead). */
  debtTrajectory: string
  stressSignals: DebtDiagnosisFinding[]
  /** Rule 23 root-cause analysis — each entry's evidenceLevel carries the real Known/Indicated/Unknown distinction. */
  possibleDrivers: DebtDiagnosisFinding[]
  /** Layer 5 "Data gap": information needed for repayment-capacity assessment that isn't present. */
  dataGaps: string[]
  accountInsights: DebtDiagnosisFinding[]
  resolutionOpportunities: DebtDiagnosisFinding[]
  actionPlan: DebtDiagnosisActionPlan
}
