/**
 * The AI output contract for MASTER_PROFILE_INSIGHTS only. Mirrors the BBS
 * Master Profile Module spec's Part 17 (per-finding contract) and Part 16
 * (AI synthesis narrative), and structurally parallels debt-diagnosis.types.ts
 * / financial-assessment.types.ts — but with its own 4-tier evidence scale
 * (spec Part 17's exact vocabulary: KNOWN/DERIVED/INDICATED/UNKNOWN),
 * deliberately different from both sibling modules' scales so a CCR can
 * tell at a glance which module's narrative they are reading.
 *
 * Advisory only (see AnalysisResult's own doc comment in schema.prisma) —
 * it interprets the deterministic facts master-profile.service.ts already
 * computed (alignment state, DSR comparison, reconciliation rows, stress
 * profile, cohort attributes); it never recomputes a ratio/score itself,
 * never assigns a cohort, and never sets alignmentState/resolutionCapacity/
 * cohortAttributes directly — those are deterministic fields the parser
 * below simply does not read off the AI response even if present.
 */
export type MasterProfileEvidenceLevel = 'KNOWN' | 'DERIVED' | 'INDICATED' | 'UNKNOWN'

export type MasterProfileSeverity = 'Positive' | 'Informational' | 'Attention' | 'Elevated' | 'Critical'

export type MasterProfileSourceModule = 'DEBT_ANALYSIS' | 'FINANCIAL_ANALYSIS'

export interface MasterProfileFinding {
  type: string
  severity: MasterProfileSeverity
  title: string
  statement: string
  /** Short citations of the specific given figures this statement is grounded in — never a re-statement of the statement itself. */
  evidence: string[]
  evidenceLevel: MasterProfileEvidenceLevel
  confidence: 'high' | 'medium' | 'low'
  /** Which upstream module(s) this finding draws on — most Master Profile findings span both. */
  sourceModules: MasterProfileSourceModule[]
  /** Identifiers drawn ONLY from ones present in the given data — never invented. */
  relatedDebtAccounts: string[]
  relatedFinancialMetrics: string[]
}

export interface MasterProfileAssessmentFindings {
  executiveProfile: string
  currentPosition: string
  creditPosition: string
  financialPosition: string
  debtBurden: string
  repaymentCapacity: string
  liquidityAssessment: string
  stressAssessment: string
  alignmentExplanation: string
  strengths: MasterProfileFinding[]
  concerns: MasterProfileFinding[]
  opportunitySignals: MasterProfileFinding[]
  possibleCauses: MasterProfileFinding[]
  keyContradictions: MasterProfileFinding[]
  validationRequired: MasterProfileFinding[]
  resolutionReadinessNarrative: string
  confidence: 'high' | 'medium' | 'low'
}
