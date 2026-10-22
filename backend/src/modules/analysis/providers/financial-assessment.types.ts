/**
 * The AI output contract for FINANCIAL_ANALYSIS_INSIGHTS only. Mirrors the
 * BBS Financial Analysis Module spec's §10 (AI Financial Assessment) and
 * §11 (Action/Resolution Priorities), and structurally parallels
 * debt-diagnosis.types.ts — but with this module's own, differently-named
 * evidence/severity scales (CONFIRMED/DERIVED/INFERRED, Positive/
 * Informational/Attention/Elevated/Critical), since the two modules'
 * findings mean different things even where the shapes look alike.
 *
 * Advisory only (see AnalysisResult's own doc comment in schema.prisma) —
 * it interprets the deterministic FinancialAnalysisService.buildSummary
 * output it is given; it never recomputes a DSR/balance/utilization/
 * monthly-total figure, and never becomes a second source of numerical truth.
 */
export type FinancialEvidenceLevel = 'CONFIRMED' | 'DERIVED' | 'INFERRED'

/** Distinct 5-tier scale from the Debt module's High/Medium/Low — this module's findings include strengths, not only risk signals. */
export type FinancialSeverity = 'Positive' | 'Informational' | 'Attention' | 'Elevated' | 'Critical'

export interface FinancialFinding {
  type: string
  severity: FinancialSeverity
  title: string
  statement: string
  /** Short citations of the specific given figures this statement is grounded in — never a re-statement of the statement itself. */
  evidence: string[]
  /**
   * CONFIRMED = a direct restatement/interpretation of a figure or flag the
   * given deterministic data already reports as AVAILABLE. DERIVED = the
   * AI's own synthesis built from >=2 CONFIRMED facts in the given data —
   * still fully traceable, but a labeling act it performed, not a number
   * the engine itself emitted. INFERRED = a plausible but unverified
   * external cause (e.g. a possible driver) — must read as a possibility,
   * never a fact.
   */
  evidenceLevel: FinancialEvidenceLevel
  confidence: 'high' | 'medium' | 'low'
  /** Identifiers drawn ONLY from ones present in the given data — never invented. */
  relatedTransactions: string[]
  relatedMonths: string[]
  relatedAccounts: string[]
}

export type ActionQuadrant = 'IMMEDIATE_REVIEW' | 'VERIFY' | 'MONITOR' | 'OPTIMIZE'

/** §11's 4-quadrant grid — one flat array (matches the spec's own actionPriorities[] shape), discriminated by `quadrant`; the UI buckets client-side. */
export interface FinancialActionPriority extends FinancialFinding {
  quadrant: ActionQuadrant
  suggestedNextStep: string
}

/** §10's "Final BBS Assessment Engine" narrative — the spec's 5 fixed questions as named fields, not free text, so the UI can render each as its own labeled block. */
export interface BbsNarrative {
  whatIsHappening: string
  whatIsTheConcern: string
  whatSupportsStability: string
  whatRequiresInvestigation: string
  whatShouldBbsDoNext: string
}

export interface FinancialAssessmentFindings {
  executiveSummary: string
  financialPosition: string
  strengths: FinancialFinding[]
  concerns: FinancialFinding[]
  liquidityAssessment: string
  cashFlowAssessment: string
  incomeAssessment: string
  debtServicingAssessment: string
  borrowingAssessment: string
  transactionBehaviourAssessment: string
  creditCorrelationAssessment: string
  possibleDrivers: FinancialFinding[]
  /** Every statement shows CONFIRMED/DERIVED/INFERRED (spec's own §10 instruction) — includes Data Gaps, so each gap carries its own evidenceLevel rather than being a plain string. */
  dataGaps: FinancialFinding[]
  investigationPriorities: FinancialFinding[]
  actionPriorities: FinancialActionPriority[]
  overallAssessment: BbsNarrative
}
