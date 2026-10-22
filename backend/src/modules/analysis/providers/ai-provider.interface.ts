import type { AiProvider } from '@prisma/client'

/**
 * Provider-independent contracts for AI-assisted analysis. A real
 * implementation (OpenAI / Gemini / DeepSeek) plugs in behind
 * `AiAnalysisProvider` without changing AnalysisService, AnalysisJob
 * persistence, or the API surface — only the implementation registered in
 * AnalysisModule changes.
 *
 * IMPORTANT: these findings are advisory input only. They are stored
 * separately (`AnalysisResult`) from the deterministic, CCR-verified
 * records (`FinancialAssessment`, `CustomerProfile`, `CohortDecision`) —
 * an AI provider never writes those directly.
 */

export type AnalysisJobType =
  | 'L1_CREDIT_SCREENING'
  | 'L2_FINANCIAL_ANALYSIS'
  | 'L3_ASSESSMENT'
  | 'RECOVERY_PLAN_GENERATION'
  | 'DEBT_ANALYSIS_INSIGHTS'
  | 'FINANCIAL_ANALYSIS_INSIGHTS'
  | 'MASTER_PROFILE_INSIGHTS'

export interface Level1AnalysisRequest {
  jobType: 'L1_CREDIT_SCREENING'
  leadId: string
  creditReport: {
    creditScore: number
    totalOutstandingBalance: number
    delinquentAccounts: number
  }
}

export interface Level2AnalysisRequest {
  jobType: 'L2_FINANCIAL_ANALYSIS'
  leadId: string
  declaredMonthlyIncome: number
  monthlyExpenses: number
  existingEmiObligations: number
  bounceCountLast6Months: number
}

export interface Level3AnalysisRequest {
  jobType: 'L3_ASSESSMENT'
  leadId: string
  level1Summary: Record<string, unknown>
  level2Summary: Record<string, unknown>
}

/**
 * Grounds the Gemini prompt in the exact deterministic facts
 * plan-engine.service.ts already computed (template-selected situation
 * assessment, problem definition, financial capacity, debt strategy,
 * targets, actions, conditions, risks/disclosures) — `bbsPlanFacts` is a
 * plain object, never raw bureau/bank data. The provider must never
 * introduce figures beyond what this object already contains, and must
 * never itself select a template/cohort or invent an action/condition/
 * target (same contract discipline as MasterProfileInsightsRequest
 * above). Redefines what was a pre-existing-but-unwired job type/request
 * shape (confirmed zero callers before this module) rather than adding a
 * new one.
 */
export interface RecoveryPlanAnalysisRequest {
  jobType: 'RECOVERY_PLAN_GENERATION'
  leadId: string
  bbsPlanFacts: Record<string, unknown>
}

/**
 * Grounds the Gemini prompt in the exact numbers the Debt Analysis tab
 * itself displays — `debtAnalysis` is the plain object returned by
 * `buildDebtAnalysisSummary` (see modules/debt-analysis/debt-analysis.calculations.ts),
 * computed from a just-saved, real CreditReport. The provider must never
 * introduce figures beyond what this object already contains.
 */
export interface DebtAnalysisInsightsRequest {
  jobType: 'DEBT_ANALYSIS_INSIGHTS'
  leadId: string
  debtAnalysis: Record<string, unknown>
}

/**
 * Grounds the Gemini prompt in the exact numbers the Financial Analysis tab
 * itself displays — `financialAnalysis` is the plain summary object
 * FinancialAnalysisService.buildSummary produces from a just-completed
 * statement-processing run. The provider must never introduce figures
 * beyond what this object already contains (same contract as
 * DebtAnalysisInsightsRequest above).
 */
export interface FinancialAnalysisInsightsRequest {
  jobType: 'FINANCIAL_ANALYSIS_INSIGHTS'
  leadId: string
  financialAnalysis: Record<string, unknown>
}

/**
 * Grounds the Gemini prompt in the exact deterministic facts
 * MasterProfileService itself just computed (identity reconciliation, DSR
 * comparison, reconciliation rows, Master Stress Profile, alignment state,
 * cohort attribute vector) — `masterProfileFacts` is a plain object, never
 * raw bureau/bank data. The provider must never introduce figures beyond
 * what this object already contains, and must never itself set
 * alignmentState/resolutionCapacity/cohortAttributes (same contract
 * discipline as DebtAnalysisInsightsRequest/FinancialAnalysisInsightsRequest
 * above).
 */
export interface MasterProfileInsightsRequest {
  jobType: 'MASTER_PROFILE_INSIGHTS'
  leadId: string
  masterProfileFacts: Record<string, unknown>
}

export type AnalysisRequest =
  | Level1AnalysisRequest
  | Level2AnalysisRequest
  | Level3AnalysisRequest
  | RecoveryPlanAnalysisRequest
  | DebtAnalysisInsightsRequest
  | FinancialAnalysisInsightsRequest
  | MasterProfileInsightsRequest

/** Advisory-only AI output. Never a finalized decision by itself. */
export interface AnalysisResponse {
  findings: Record<string, unknown>
  confidence: number
  modelVersion: string
}

export interface AiAnalysisProvider {
  readonly providerName: AiProvider
  analyze(request: AnalysisRequest): Promise<AnalysisResponse>
}

export const AI_ANALYSIS_PROVIDER = Symbol('AI_ANALYSIS_PROVIDER')

/**
 * Base class for every error a real AI provider implementation can raise —
 * lets AnalysisService (or a future caller) classify a failure without
 * string-matching messages, same convention as
 * bureau/providers/credit-report-provider.interface.ts's
 * CreditReportProviderError hierarchy.
 */
export abstract class AiProviderError extends Error {
  abstract readonly code: string
}

export class AiProviderTimeoutError extends AiProviderError {
  readonly code = 'NETWORK_TIMEOUT'
}

export class AiProviderAuthenticationError extends AiProviderError {
  readonly code = 'AUTHENTICATION_ERROR'
}

export class AiProviderRateLimitError extends AiProviderError {
  readonly code = 'RATE_LIMIT'
}

export class AiProviderInvalidRequestError extends AiProviderError {
  readonly code = 'INVALID_REQUEST'
}

export class AiProviderModelNotFoundError extends AiProviderError {
  readonly code = 'MODEL_NOT_FOUND'
}

/** Generic transport/connectivity failure, or a non-2xx status not covered by a more specific class above. */
export class AiProviderTransportError extends AiProviderError {
  readonly code = 'PROVIDER_ERROR'
}

/** The HTTP call succeeded but the response had no usable candidate text at all (not the same as malformed JSON *within* that text — see parseFindings/parseDebtDiagnosisFindings, which degrade gracefully instead of throwing). */
export class AiProviderInvalidResponseError extends AiProviderError {
  readonly code = 'INVALID_MODEL_RESPONSE'
}
