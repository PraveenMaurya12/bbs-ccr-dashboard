import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AiProvider } from '@prisma/client'

import type { AppConfig } from '@/config/configuration'
import {
  AiProviderAuthenticationError,
  AiProviderInvalidRequestError,
  AiProviderInvalidResponseError,
  AiProviderModelNotFoundError,
  AiProviderRateLimitError,
  AiProviderTimeoutError,
  AiProviderTransportError,
  type AiAnalysisProvider,
  type AnalysisRequest,
  type AnalysisResponse,
  type DebtAnalysisInsightsRequest,
  type FinancialAnalysisInsightsRequest,
  type MasterProfileInsightsRequest,
  type RecoveryPlanAnalysisRequest,
} from './ai-provider.interface'
import type { BbsPlanNarrative } from './bbs-plan-narrative.types'
import type { DebtDiagnosisActionPlan, DebtDiagnosisFinding, DebtDiagnosisFindings, EvidenceLevel } from './debt-diagnosis.types'
import type { BbsNarrative, FinancialActionPriority, FinancialAssessmentFindings, FinancialEvidenceLevel, FinancialFinding, FinancialSeverity } from './financial-assessment.types'
import type { MasterProfileAssessmentFindings, MasterProfileEvidenceLevel, MasterProfileFinding, MasterProfileSeverity, MasterProfileSourceModule } from './master-profile-assessment.types'

/**
 * Structured advisory shape for DEBT_ANALYSIS_INSIGHTS — Gemini sits inside
 * BBS Level 1, strictly after the deterministic Credit Position/Debt
 * Inventory/Risk Signal calculations (see debt-analysis.calculations.ts):
 * it interprets that already-computed data, it never becomes a second
 * source of numerical truth. `confidenceLevel` is Gemini's own qualitative
 * self-assessment of the analysis — distinct from (and not to be confused
 * with) `AnalysisResult.confidence`, the outer numeric DB column, which
 * this provider always reports as 0 (no calibrated score exists).
 */
export interface GeminiFindings {
  summary: string
  keyObservations: string[]
  concerns: string[]
  questionsForCcr: string[]
  dataGaps: string[]
  confidenceLevel: string
}

/**
 * Real Gemini integration via the plain Generative Language REST API (no
 * SDK dependency — one JSON POST). Output is advisory-only, exactly like
 * MockAiProvider's (see AnalysisResult's own doc comment in
 * prisma/schema.prisma) — it is never written into a deterministic,
 * CCR-verified record directly.
 *
 * The prompt for every job type is built ONLY from that request's own
 * already-computed, real fields (see ai-provider.interface.ts) — this
 * provider never adds figures of its own. For DEBT_ANALYSIS_INSIGHTS
 * specifically, that means the exact object the Debt Analysis tab itself
 * renders (`buildDebtAnalysisSummary`'s output), so Gemini's narrative
 * output is grounded in the same numbers a CCR can see on screen.
 */
@Injectable()
export class GeminiAiProvider implements AiAnalysisProvider {
  readonly providerName = AiProvider.GEMINI
  private readonly logger = new Logger(GeminiAiProvider.name)

  constructor(private readonly configService: ConfigService) {}

  private get config() {
    return this.configService.get<AppConfig>('app')!.analysis.gemini
  }

  /** Never logs GEMINI_API_KEY/Authorization/full PAN/the raw prompt or response body — only provider/model/timing/status metadata. */
  private log(event: string, details: Record<string, string | number | undefined>): void {
    const parts = Object.entries(details)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
    this.logger.log(`${event} ${parts.join(' ')}`)
  }

  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    // DEBT_ANALYSIS_INSIGHTS, FINANCIAL_ANALYSIS_INSIGHTS,
    // MASTER_PROFILE_INSIGHTS, and RECOVERY_PLAN_GENERATION each use their
    // own, much richer contract (see debt-diagnosis.types.ts /
    // financial-assessment.types.ts / master-profile-assessment.types.ts /
    // bbs-plan-narrative.types.ts respectively) — every other job type
    // keeps the original flat GeminiFindings shape below, completely
    // untouched by any of the four rebuilds.
    let findings: Record<string, unknown>
    if (request.jobType === 'DEBT_ANALYSIS_INSIGHTS') {
      findings = (await this.callGeminiRaw(buildDebtDiagnosisPrompt(request)).then(parseDebtDiagnosisFindings)) as unknown as Record<string, unknown>
    } else if (request.jobType === 'FINANCIAL_ANALYSIS_INSIGHTS') {
      findings = (await this.callGeminiRaw(buildFinancialAssessmentPrompt(request)).then(parseFinancialAssessmentFindings)) as unknown as Record<string, unknown>
    } else if (request.jobType === 'MASTER_PROFILE_INSIGHTS') {
      findings = (await this.callGeminiRaw(buildMasterProfilePrompt(request)).then(parseMasterProfileAssessmentFindings)) as unknown as Record<string, unknown>
    } else if (request.jobType === 'RECOVERY_PLAN_GENERATION') {
      findings = (await this.callGeminiRaw(buildBbsPlanNarrativePrompt(request)).then(parseBbsPlanNarrative)) as unknown as Record<string, unknown>
    } else {
      findings = (await this.callGeminiRaw(buildPrompt(request)).then(parseFindings)) as unknown as Record<string, unknown>
    }

    return {
      findings,
      // Gemini's REST API does not return a calibrated confidence score for
      // free-text generation — 0 here means "not reported by the
      // provider", never a real measured confidence.
      confidence: 0,
      modelVersion: this.config.model,
    }
  }

  private async callGeminiRaw(prompt: string): Promise<string> {
    const { apiKey, model, requestTimeoutMs, thinkingLevel } = this.config
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured — cannot call the real Gemini provider.')
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

    const requestBody: Record<string, unknown> = { contents: [{ parts: [{ text: prompt }] }] }
    // thinkingLevel replaces Gemini 2.5's numeric thinkingBudget for Gemini
    // 3.x models (generationConfig.thinkingConfig.thinkingLevel: "low"|
    // "medium"|"high") — omitted entirely when thinkingLevel is '' (e.g. a
    // configured model that doesn't support thinking at all).
    if (thinkingLevel) {
      requestBody.generationConfig = { thinkingConfig: { thinkingLevel } }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
    const startedAt = Date.now()

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })
    } catch (error) {
      const elapsedMs = Date.now() - startedAt
      if (error instanceof Error && error.name === 'AbortError') {
        this.log('GEMINI_CALL_TIMED_OUT', { model, elapsedMs, requestTimeoutMs })
        throw new AiProviderTimeoutError(`Gemini request timed out after ${requestTimeoutMs}ms`)
      }
      this.log('GEMINI_CALL_TRANSPORT_FAILED', { model, elapsedMs, error: error instanceof Error ? error.message : String(error) })
      throw new AiProviderTransportError(`Gemini request failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      clearTimeout(timeout)
    }

    const elapsedMs = Date.now() - startedAt
    this.log('GEMINI_CALL_RESPONDED', { model, elapsedMs, httpStatus: response.status })

    if (!response.ok) {
      const body = await response.text()
      const detail = body.slice(0, 500)
      if (response.status === 401 || response.status === 403) {
        throw new AiProviderAuthenticationError(`Gemini API authentication failed (HTTP ${response.status}): ${detail}`)
      }
      if (response.status === 429) {
        throw new AiProviderRateLimitError(`Gemini API rate limit exceeded (HTTP 429): ${detail}`)
      }
      if (response.status === 404) {
        throw new AiProviderModelNotFoundError(`Gemini model "${model}" was not found (HTTP 404): ${detail}`)
      }
      if (response.status === 400) {
        throw new AiProviderInvalidRequestError(`Gemini API rejected the request (HTTP 400): ${detail}`)
      }
      throw new AiProviderTransportError(`Gemini API responded with HTTP ${response.status}: ${detail}`)
    }

    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
    }
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      throw new AiProviderInvalidResponseError('Gemini response contained no candidate text')
    }
    // CRITICAL: a response cut off mid-generation is necessarily incomplete
    // JSON — see ClaudeAiProvider's own identical check (and its doc
    // comment) for the live defect this guards against. Kept in parity
    // here so a rollback to Gemini never silently reintroduces the same
    // truncated-JSON-leaking-as-narrative defect.
    if (body.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      this.log('GEMINI_RESPONSE_TRUNCATED', { model })
      throw new AiProviderInvalidResponseError(
        'Gemini response was truncated at the model\'s configured output-token limit before completing — the JSON body is necessarily incomplete.',
      )
    }

    return text
  }
}

// --- Prompt builders (provider-agnostic — pure functions of the request,
// reused by ClaudeAiProvider so both providers are grounded in the exact
// same guardrail language and expected JSON shape) ---

export function buildPrompt(request: AnalysisRequest): string {
  const instructions =
    'You are assisting a loan-recovery CCR (customer care representative) dashboard. The JSON data below is ' +
    "the BBS Level 1 Credit Intelligence already computed deterministically from a real bureau report — it is " +
    'not raw bureau data, and every number in it is already final and correct. Respond with ONLY a JSON object ' +
    'of the exact shape {"summary": string, "keyObservations": string[], "concerns": string[], ' +
    '"questionsForCcr": string[], "dataGaps": string[], "confidenceLevel": string}. ' +
    '"summary" is a concise plain-language description of the borrower\'s credit position. "keyObservations" ' +
    'are neutral factual observations. "concerns" are things worth flagging, without moral or legal judgment. ' +
    '"questionsForCcr" are specific questions the CCR should verify with the borrower during a call. ' +
    '"dataGaps" name any field that is missing/unavailable in the given data (never invent a value to fill a ' +
    'gap). "confidenceLevel" is your own qualitative confidence in this analysis given the data available ' +
    '("high"/"medium"/"low"). Every statement must be strictly derivable from the given data — never invent ' +
    'accounts, balances, lenders, DPD, or enquiries, never change a given number, and never state a final ' +
    'debt-resolution decision or promise a particular outcome. The given data never includes income, EMI ' +
    "affordability/capacity, employment, or household income — never invent values for these either; if " +
    'repayment capacity is relevant, note it as a data gap instead. No markdown, no commentary outside the ' +
    'JSON object.'

  return `${instructions}\n\nJob type: ${request.jobType}\nData:\n${JSON.stringify(request, null, 2)}`
}

/**
 * Rule 23 (Known/Indicated/Unknown root-cause analysis) and the Layer
 * 5/6 output framework drive this prompt's exact shape — see
 * debt-diagnosis.types.ts for the full contract and per-field doc
 * comments. `request.debtAnalysis` is the Phase-1-extended
 * `buildDebtAnalysisSummary` object — already includes `debtServiceRatio`/
 * `debtToIncome` (present only when real income was on file) and the
 * `unavailable` block (trajectory/bank cross-check/interest-rate-tenure/
 * status-99), so the provider is told explicitly to restate those honestly
 * rather than invent around them.
 */
export function buildDebtDiagnosisPrompt(request: DebtAnalysisInsightsRequest): string {
  const instructions =
    'You are assisting a loan-recovery CCR (customer care representative) dashboard, producing the "Debt Diagnosis" ' +
    'and "BBS Action Plan" layers of the BBS Debt Analysis Module. The JSON data below is the BBS deterministic debt ' +
    'analysis already computed from a real bureau report (and, when present, real declared income) — it is not raw ' +
    'bureau data, and every number in it is already final and correct; you only interpret it, you never recompute it. ' +
    'Respond with ONLY a JSON object of this exact shape: {"executiveSummary": string, "currentPosition": string, ' +
    '"primaryConcerns": Finding[], "secondaryConcerns": Finding[], "historicalContext": Finding[], ' +
    '"debtTrajectory": string, "stressSignals": Finding[], "possibleDrivers": Finding[], "dataGaps": string[], ' +
    '"accountInsights": Finding[], "resolutionOpportunities": Finding[], "actionPlan": {"verify": string[], ' +
    '"immediateAttention": string[], "monitor": string[], "optimize": string[]}}, where Finding = {"type": string, ' +
    '"severity": "High"|"Medium"|"Low", "title": string, "statement": string, "evidence": string[], ' +
    '"evidenceLevel": "KNOWN"|"INDICATED"|"UNKNOWN", "relatedAccounts": string[], "confidence": "high"|"medium"|"low"}. ' +
    '"currentPosition" states the current repayment picture using only reported facts. "primaryConcerns" names the ' +
    'single largest evidence-supported structural issue first; "secondaryConcerns" the next material issue(s). ' +
    '"historicalContext" summarizes material PAST delinquency/status events, kept strictly separate from current ' +
    'ones. "debtTrajectory" must literally restate the given data\'s own unavailable.trajectory.reason — never invent ' +
    'an increasing/declining/stable trend, since this system never retains more than one bureau snapshot per lead. ' +
    'For "possibleDrivers" (root-cause analysis): mark evidenceLevel "KNOWN" only when directly supported by the ' +
    'given data, "INDICATED" when a pattern is merely consistent with a possible driver (income insufficiency, ' +
    'expense pressure, business cash-flow gaps, emergency expenditure, consolidation, short-term liquidity needs, ' +
    'credit-card dependency), and "UNKNOWN" when the needed evidence is not reported — never assume a cause without ' +
    'evidence. "actionPlan.verify" lists what to confirm with the borrower (income, EMI, loan purpose, interest ' +
    'rate, remaining tenure, bank cash flow) — ONLY use the given debtServiceRatio/debtToIncome figures if their own ' +
    'availability field is "AVAILABLE"; if it is NOT_REPORTED, list income/EMI verification itself as a to-verify ' +
    'item instead of stating a figure. Every statement must be strictly derivable from the given data — never ' +
    'invent accounts, balances, lenders, DPD, enquiries, interest rates, or tenures, never change a given number, ' +
    'and never state a final debt-resolution decision or promise a particular outcome. No markdown, no commentary ' +
    'outside the JSON object.'

  return `${instructions}\n\nData:\n${JSON.stringify(request.debtAnalysis, null, 2)}`
}

/**
 * §10 (AI Financial Assessment) and §11 (Action/Resolution Priorities) —
 * see financial-assessment.types.ts for the full contract and per-field
 * doc comments. `request.financialAnalysis` is
 * FinancialAnalysisService.buildSummary's output — already includes each
 * score component's own DataAvailability, the separate 0-100 stress
 * indicator, every risk flag, and the credit-correlation outcomes, so
 * the provider is told explicitly to restate availability/correlation
 * outcomes honestly rather than invent around them.
 */
export function buildFinancialAssessmentPrompt(request: FinancialAnalysisInsightsRequest): string {
  const instructions =
    'You are assisting a loan-recovery CCR (customer care representative) dashboard, producing the "AI Financial ' +
    'Assessment" and "Action/Resolution Priorities" sections of the BBS Financial Analysis Module. The JSON data ' +
    'below is the BBS deterministic financial analysis already computed from a real bank statement (classification, ' +
    'monthly aggregation, the 9-component Financial Health Score, the separate 0-100 Financial Stress Indicator, ' +
    'risk flags, and credit-report correlation outcomes) — it is not raw transaction data, and every number, DSR, ' +
    'balance, utilization percent, and monthly total in it is already final and correct; you only interpret it, you ' +
    'never recompute, re-derive, or restate it differently, and you never decide whether a transaction pattern is ' +
    '"mathematically recurring" yourself — that label, when present, is the engine\'s own classification, only ever ' +
    'restated, never assigned by you. Respond with ONLY a JSON object of this exact shape: {"executiveSummary": ' +
    'string, "financialPosition": string, "strengths": Finding[], "concerns": Finding[], "liquidityAssessment": ' +
    'string, "cashFlowAssessment": string, "incomeAssessment": string, "debtServicingAssessment": string, ' +
    '"borrowingAssessment": string, "transactionBehaviourAssessment": string, "creditCorrelationAssessment": ' +
    'string, "possibleDrivers": Finding[], "dataGaps": Finding[], "investigationPriorities": Finding[], ' +
    '"actionPriorities": ActionFinding[], "overallAssessment": {"whatIsHappening": string, "whatIsTheConcern": ' +
    'string, "whatSupportsStability": string, "whatRequiresInvestigation": string, "whatShouldBbsDoNext": string}}, ' +
    'where Finding = {"type": string, "severity": "Positive"|"Informational"|"Attention"|"Elevated"|"Critical", ' +
    '"title": string, "statement": string, "evidence": string[], "evidenceLevel": "CONFIRMED"|"DERIVED"|"INFERRED", ' +
    '"confidence": "high"|"medium"|"low", "relatedTransactions": string[], "relatedMonths": string[], ' +
    '"relatedAccounts": string[]}, and ActionFinding = Finding & {"quadrant": "IMMEDIATE_REVIEW"|"VERIFY"|' +
    '"MONITOR"|"OPTIMIZE", "suggestedNextStep": string}. ' +
    'Evidence-level meanings for THIS module (distinct from the Debt module\'s KNOWN/INDICATED/UNKNOWN): CONFIRMED ' +
    '= a direct restatement of a figure/flag the given data already reports with availability "AVAILABLE". DERIVED ' +
    '= your own synthesis built from two or more CONFIRMED facts already in the given data — still fully ' +
    'traceable, but a labeling act you performed, not a number the engine emitted. INFERRED = a plausible but ' +
    'unverified external cause (used for "possibleDrivers" especially) — must be hedged ("may indicate", "is ' +
    'consistent with"), paired with a corresponding dataGaps entry naming what would confirm it, and never assumed ' +
    'without evidence. If a backing field\'s own availability is NOT_REPORTED/NOT_APPLICABLE/INSUFFICIENT_DATA, the ' +
    'corresponding prose assessment must say so plainly — never invent a number or silently omit the topic, and ' +
    'never convert a missing value to zero. Forbidden conclusions: never use "debt trap", "won\'t pay", "refusing ' +
    'to pay", or "defaulting" from a bounce/DSR/investigation signal alone — state only what is observed and that ' +
    'it requires investigation or verification; never recommend approving/declining credit or a specific loan ' +
    'amount. The given data separates bounce evidence into Confirmed/Possible/Unknown tiers — never merge them or ' +
    'promote a Possible bounce into a confirmed one. When a bureau-reported obligation has no matching bank ' +
    'repayment (CREDIT_OBLIGATION_NOT_OBSERVED in the given data), your own wording must say "repayment not ' +
    'observed in this statement" — never "missed payment" or "defaulted", since the absence of a matching ' +
    'transaction is not proof of non-payment. "actionPriorities[].quadrant": IMMEDIATE_REVIEW = evidence-supported ' +
    'current risk needing same-day attention; VERIFY = plausible but needs borrower/CCR confirmation; MONITOR = ' +
    'not urgent but worth tracking; OPTIMIZE = a positive-leaning suggestion, not a risk — a "Positive"/' +
    '"Informational" severity item should essentially never appear under IMMEDIATE_REVIEW. ' +
    '"relatedTransactions"/"relatedMonths"/"relatedAccounts" may only contain identifiers that literally appear in ' +
    'the given data — never invented. Every statement must be strictly derivable from the given data — never ' +
    'invent a monthly salary figure from a single transaction, never invent accounts, balances, lenders, or ' +
    'transactions, never change a given number. No markdown, no commentary outside the JSON object.'

  return `${instructions}\n\nData:\n${JSON.stringify(request.financialAnalysis, null, 2)}`
}

/**
 * The Master Profile module's own synthesis layer — see
 * master-profile-assessment.types.ts for the full contract. `request.masterProfileFacts`
 * is the plain deterministic-facts object master-profile.service.ts
 * assembles after running its own reconciliation/alignment/stress/cohort
 * pipeline (never raw bureau/bank data) — the provider interprets and
 * explains it, it never recomputes a ratio, never assigns a cohort, and
 * never overrides the given alignmentState/resolutionCapacity.
 */
export function buildMasterProfilePrompt(request: MasterProfileInsightsRequest): string {
  const instructions =
    'You are assisting a loan-recovery CCR (customer care representative) dashboard, producing the AI synthesis ' +
    'layer of the BBS Master Profile — the module that reconciles BBS Debt Analysis (credit report) and BBS ' +
    'Financial Analysis (bank statement) into one evidence-based profile. The JSON data below is the BBS ' +
    'deterministic Master Profile facts already computed: identity reconciliation, a credit<->bank reconciliation ' +
    'table, Bureau/Bank/Master DSR, a combined Master Stress Profile, a 6-state credit<->financial alignment ' +
    'classification, and a deterministic cohort attribute vector — every number, ratio, match status, alignment ' +
    'state, and cohort attribute is already final and correct; you only interpret and explain it, you never ' +
    'recompute a ratio, never recalculate a score, never override the given alignmentState or resolutionCapacity, ' +
    'and you never assign a cohort yourself — cohortAttributes is for a separate downstream Cohort Engine, not ' +
    'something you decide. Respond with ONLY a JSON object of this exact shape: {"executiveProfile": string, ' +
    '"currentPosition": string, "creditPosition": string, "financialPosition": string, "debtBurden": string, ' +
    '"repaymentCapacity": string, "liquidityAssessment": string, "stressAssessment": string, ' +
    '"alignmentExplanation": string, "strengths": Finding[], "concerns": Finding[], "opportunitySignals": ' +
    'Finding[], "possibleCauses": Finding[], "keyContradictions": Finding[], "validationRequired": Finding[], ' +
    '"resolutionReadinessNarrative": string, "confidence": "high"|"medium"|"low"}, where Finding = {"type": ' +
    'string, "severity": "Positive"|"Informational"|"Attention"|"Elevated"|"Critical", "title": string, ' +
    '"statement": string, "evidence": string[], "evidenceLevel": "KNOWN"|"DERIVED"|"INDICATED"|"UNKNOWN", ' +
    '"confidence": "high"|"medium"|"low", "sourceModules": ("DEBT_ANALYSIS"|"FINANCIAL_ANALYSIS")[], ' +
    '"relatedDebtAccounts": string[], "relatedFinancialMetrics": string[]}. ' +
    'Evidence-level meanings for THIS module (its own 4-tier scale, distinct from both sibling modules\' scales): ' +
    'KNOWN = both modules, or multiple strong sources, directly support the statement. DERIVED = your own ' +
    'synthesis built from >=2 KNOWN facts already in the given data. INDICATED = one module\'s evidence suggests ' +
    'this but the other module does not confirm it (a genuine cross-module gap, not a weak guess). UNKNOWN = ' +
    'inference from incomplete or ambiguous evidence — must read as a possibility, never a fact. ' +
    '"executiveProfile" is a 2-4 sentence synthesis of the complete financial position; "currentPosition" states ' +
    'what is happening now; "creditPosition"/"financialPosition" summarize what each source shows; "debtBurden" ' +
    'states obligations and how they are being serviced per the given reconciliation table; "repaymentCapacity" ' +
    'must use only the given Bureau/Bank/Master DSR figures, never a recalculated one; "alignmentExplanation" ' +
    'explains WHY the given alignmentState was reached, restating it, never substituting a different one. ' +
    'For "possibleCauses", only use the spec\'s vocabulary (recent borrowing, income change, expense pressure, ' +
    'multiple loans, credit-card dependency, business cash-flow pressure, medical/family expense, asset purchase, ' +
    'debt consolidation, temporary liquidity gap) and only when the given data actually supports it — never invent ' +
    'a cause with no supporting evidence in the given facts. "keyContradictions" names only genuine disagreements ' +
    'between what the credit report and the bank statement show — never invent one when the given data agrees. ' +
    'When a reconciliation row\'s matchStatus is NOT_OBSERVED, your own wording must say "repayment not observed ' +
    'in this statement" (restating the given explanation) — never "missed payment" or "defaulted", and never ' +
    'imply a bank statement with an earlier period proves current financial behaviour (restate any given date- ' +
    'alignment warning plainly instead). "relatedDebtAccounts"/"relatedFinancialMetrics" may only contain ' +
    'identifiers that literally appear in the given data — never invented. Every statement must be strictly ' +
    'derivable from the given data — never invent accounts, balances, lenders, transactions, or a cohort. No ' +
    'markdown, no commentary outside the JSON object.'

  return `${instructions}\n\nData:\n${JSON.stringify(request.masterProfileFacts, null, 2)}`
}

export function buildBbsPlanNarrativePrompt(request: RecoveryPlanAnalysisRequest): string {
  const instructions =
    'You are assisting a loan-recovery CCR (customer care representative) dashboard, producing the customer-facing ' +
    'narrative for an already-decided BBS intervention plan. The JSON data below (`bbsPlanFacts`) is the BBS Plan ' +
    'Engine’s own deterministic output: a template-selected situation assessment, problem definition, financial ' +
    'capacity/targets, debt strategy, a phased action list, conditions, risks, disclosures, and success criteria — ' +
    'every fact, number, action, condition, and target is already final and decided; you only explain it in plain, ' +
    'customer-safe language. You must NEVER invent a fact, change a number, select a different cohort or template, ' +
    'invent a new action/condition/target, invent a lender decision, promise a particular outcome, remove a given ' +
    'risk/disclosure, or imply any control BBS does not actually have. Respond with ONLY a JSON object of this ' +
    'exact shape: {"whereYouAreToday": string, "whatNeedsAttention": string, "whyThisPlan": string, ' +
    '"whatHappensFirst": string, "yourJourney": string, "whatBbsWillDo": string, "whatWeNeedFromYou": string, ' +
    '"lenderDependencies": string, "whatCanChangeThePlan": string, "howProgressIsMeasured": string, ' +
    '"reviewDate": string, "confidence": "high"|"medium"|"low"}. "whereYouAreToday" restates the given situation ' +
    'assessment in plain language. "whatNeedsAttention" restates the given problem definition. "whyThisPlan" ' +
    'explains why this plan/template fits, grounded only in the given cohort/pathway/capacity facts. ' +
    '"whatHappensFirst" and "yourJourney" describe only the given actions, grouped by their given phase (never ' +
    'inventing a new one). "whatBbsWillDo"/"whatWeNeedFromYou" split the given actions by their given ownerType ' +
    '(BBS vs CUSTOMER) — never move an action to a different owner. "lenderDependencies" restates only given ' +
    'CREDITOR-owned actions/conditions; if there are none, say so plainly rather than inventing one. ' +
    '"whatCanChangeThePlan" restates only the given risks/monitoring triggers. "howProgressIsMeasured" restates ' +
    'only the given success criteria. "reviewDate" restates only the given review schedule. "confidence" is your ' +
    'own qualitative confidence in how clearly this plan’s facts translate to plain language, not a judgment ' +
    'on the plan itself. No markdown, no commentary outside the JSON object.'

  return `${instructions}\n\nData:\n${JSON.stringify(request.bbsPlanFacts, null, 2)}`
}

/** Strips a possible ```json ... ``` fence the model sometimes adds despite being asked not to. */
function stripMarkdownFence(rawText: string): string {
  return rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
}

const COMMON_RESPONSE_WRAPPER_KEYS = ['response', 'result', 'data', 'output', 'findings']

/**
 * Parses `stripped` as JSON and reports whether the source text was
 * genuinely JSON at all — this distinction is the fix for a real defect a
 * live Master Profile QA pass found: a provider's response was valid,
 * parseable JSON that simply nested the expected fields one level deeper
 * than requested (e.g. `{"response": {"executiveProfile": "...", ...}}`),
 * and the old code's blanket "field missing -> fall back to the raw
 * stripped text" rule dumped that entire JSON object into a user-facing
 * narrative field. `sourceWasJson: true` means a real, parseable JSON
 * object was found (even if the requested field is still missing after
 * attempting the one-level unwrap below) — callers must NEVER use the raw
 * `stripped` text as a narrative fallback in that case, only when
 * `sourceWasJson` is false (the model wrote free text instead of JSON, so
 * surfacing that text verbatim is the intended, safe fallback).
 */
function parseModelJson(stripped: string, requiredNarrativeField: string): { parsed: Record<string, unknown>; sourceWasJson: boolean } {
  let parsed: Record<string, unknown> = {}
  let sourceWasJson = false
  try {
    const candidate: unknown = JSON.parse(stripped)
    if (typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)) {
      parsed = candidate as Record<string, unknown>
      sourceWasJson = true
    }
  } catch {
    // Not valid JSON at all — `parsed` stays `{}`, `sourceWasJson` stays false.
  }

  // One-level recovery: the model occasionally nests its answer under a
  // common wrapper key instead of returning the requested shape directly.
  // Never recurses further than one level, and never overwrites a `parsed`
  // that already has the required field.
  if (sourceWasJson && typeof parsed[requiredNarrativeField] !== 'string') {
    for (const key of COMMON_RESPONSE_WRAPPER_KEYS) {
      const nested = parsed[key]
      if (typeof nested === 'object' && nested !== null && !Array.isArray(nested) && typeof (nested as Record<string, unknown>)[requiredNarrativeField] === 'string') {
        parsed = nested as Record<string, unknown>
        break
      }
    }
  }

  return { parsed, sourceWasJson }
}

/**
 * True when `stripped` opens like an attempted JSON object/array
 * (`{`/`[`), even if it never actually parsed — e.g. a response truncated
 * mid-generation (see ClaudeAiProvider/GeminiAiProvider's own explicit
 * `stop_reason`/`finishReason` truncation checks, which should normally
 * catch this earlier; this is the defense-in-depth fallback for any path
 * that doesn't surface that signal). Text shaped like this must never be
 * shown to a CCR as if it were a plain-language narrative.
 */
function looksLikeJsonAttempt(stripped: string): boolean {
  const trimmed = stripped.trimStart()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

/**
 * The one safe place a parser may fall back to the model's raw text for a
 * user-facing narrative field — only when the response neither parsed as
 * JSON nor even looks like an attempted JSON payload (i.e. it is genuinely
 * free-form prose). A syntactically valid JSON object that merely lacks
 * this field, or text that looks like JSON but is malformed/truncated,
 * must never leak its raw text into the narrative (see parseModelJson's
 * own doc comment for the live defect this guards against); it defaults to
 * an honest empty string instead, exactly like every other missing string
 * field in these parsers already does.
 */
function resolveNarrativeField(parsed: Record<string, unknown>, field: string, sourceWasJson: boolean, stripped: string): string {
  const value = parsed[field]
  if (typeof value === 'string') return value
  return sourceWasJson || looksLikeJsonAttempt(stripped) ? '' : stripped
}

export function parseFindings(rawText: string): GeminiFindings {
  const stripped = stripMarkdownFence(rawText)
  const { parsed, sourceWasJson } = parseModelJson(stripped, 'summary')

  const stringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []

  return {
    summary: resolveNarrativeField(parsed, 'summary', sourceWasJson, stripped),
    keyObservations: stringArray(parsed.keyObservations),
    concerns: stringArray(parsed.concerns),
    questionsForCcr: stringArray(parsed.questionsForCcr),
    dataGaps: stringArray(parsed.dataGaps),
    confidenceLevel: typeof parsed.confidenceLevel === 'string' ? parsed.confidenceLevel : 'unknown',
  }
}

// --- DEBT_ANALYSIS_INSIGHTS parsing (hand-rolled validation, no zod — see this file's own task history) ---

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
}

function toEvidenceLevel(value: unknown): EvidenceLevel {
  return value === 'KNOWN' || value === 'INDICATED' || value === 'UNKNOWN' ? value : 'UNKNOWN'
}

function toSeverity(value: unknown): 'High' | 'Medium' | 'Low' {
  return value === 'High' || value === 'Medium' || value === 'Low' ? value : 'Low'
}

function toConfidence(value: unknown): 'high' | 'medium' | 'low' {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low'
}

/** Drops anything that isn't at least a real {title, statement} pair — never fabricates a finding's core text out of missing fields. */
function toFinding(value: unknown): DebtDiagnosisFinding | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.title !== 'string' || typeof v.statement !== 'string') return null
  return {
    type: typeof v.type === 'string' ? v.type : 'general',
    severity: toSeverity(v.severity),
    title: v.title,
    statement: v.statement,
    evidence: stringArrayField(v.evidence),
    evidenceLevel: toEvidenceLevel(v.evidenceLevel),
    relatedAccounts: stringArrayField(v.relatedAccounts),
    confidence: toConfidence(v.confidence),
  }
}

function toFindingArray(value: unknown): DebtDiagnosisFinding[] {
  return Array.isArray(value) ? value.map(toFinding).filter((f): f is DebtDiagnosisFinding => f !== null) : []
}

function toActionPlan(value: unknown): DebtDiagnosisActionPlan {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return {
    verify: stringArrayField(v.verify),
    immediateAttention: stringArrayField(v.immediateAttention),
    monitor: stringArrayField(v.monitor),
    optimize: stringArrayField(v.optimize),
  }
}

/**
 * Hand-rolled validation (no zod/ajv — this backend has no runtime schema
 * validator anywhere, and this rebuild does not introduce one; see
 * parseFindings above for the same convention already established). Never
 * throws: malformed, partial, or non-JSON model output all degrade to a
 * safe, honestly-empty structure rather than crashing the analysis job —
 * missing arrays become `[]`, missing enums fall back to their most
 * conservative value, and non-JSON text is preserved as `executiveSummary`.
 */
export function parseDebtDiagnosisFindings(rawText: string): DebtDiagnosisFindings {
  const stripped = stripMarkdownFence(rawText)
  const { parsed, sourceWasJson } = parseModelJson(stripped, 'executiveSummary')

  return {
    executiveSummary: resolveNarrativeField(parsed, 'executiveSummary', sourceWasJson, stripped),
    currentPosition: typeof parsed.currentPosition === 'string' ? parsed.currentPosition : '',
    primaryConcerns: toFindingArray(parsed.primaryConcerns),
    secondaryConcerns: toFindingArray(parsed.secondaryConcerns),
    historicalContext: toFindingArray(parsed.historicalContext),
    debtTrajectory:
      typeof parsed.debtTrajectory === 'string' ? parsed.debtTrajectory : 'Insufficient data to determine debt trajectory.',
    stressSignals: toFindingArray(parsed.stressSignals),
    possibleDrivers: toFindingArray(parsed.possibleDrivers),
    dataGaps: stringArrayField(parsed.dataGaps),
    accountInsights: toFindingArray(parsed.accountInsights),
    resolutionOpportunities: toFindingArray(parsed.resolutionOpportunities),
    actionPlan: toActionPlan(parsed.actionPlan),
  }
}

// --- FINANCIAL_ANALYSIS_INSIGHTS parsing (hand-rolled validation, same convention as above — no zod) ---

function toFinancialEvidenceLevel(value: unknown): FinancialEvidenceLevel {
  return value === 'CONFIRMED' || value === 'DERIVED' || value === 'INFERRED' ? value : 'INFERRED'
}

function toFinancialSeverity(value: unknown): FinancialSeverity {
  return value === 'Positive' || value === 'Informational' || value === 'Attention' || value === 'Elevated' || value === 'Critical' ? value : 'Informational'
}

/** Drops anything that isn't at least a real {title, statement} pair — never fabricates a finding's core text out of missing fields. */
function toFinancialFinding(value: unknown): FinancialFinding | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.title !== 'string' || typeof v.statement !== 'string') return null
  return {
    type: typeof v.type === 'string' ? v.type : 'general',
    severity: toFinancialSeverity(v.severity),
    title: v.title,
    statement: v.statement,
    evidence: stringArrayField(v.evidence),
    evidenceLevel: toFinancialEvidenceLevel(v.evidenceLevel),
    confidence: toConfidence(v.confidence),
    relatedTransactions: stringArrayField(v.relatedTransactions),
    relatedMonths: stringArrayField(v.relatedMonths),
    relatedAccounts: stringArrayField(v.relatedAccounts),
  }
}

function toFinancialFindingArray(value: unknown): FinancialFinding[] {
  return Array.isArray(value) ? value.map(toFinancialFinding).filter((f): f is FinancialFinding => f !== null) : []
}

const ACTION_QUADRANTS = new Set(['IMMEDIATE_REVIEW', 'VERIFY', 'MONITOR', 'OPTIMIZE'])

function toActionPriority(value: unknown): FinancialActionPriority | null {
  const finding = toFinancialFinding(value)
  if (!finding) return null
  const v = value as Record<string, unknown>
  const quadrant = typeof v.quadrant === 'string' && ACTION_QUADRANTS.has(v.quadrant) ? (v.quadrant as FinancialActionPriority['quadrant']) : 'MONITOR'
  return { ...finding, quadrant, suggestedNextStep: typeof v.suggestedNextStep === 'string' ? v.suggestedNextStep : '' }
}

function toActionPriorityArray(value: unknown): FinancialActionPriority[] {
  return Array.isArray(value) ? value.map(toActionPriority).filter((f): f is FinancialActionPriority => f !== null) : []
}

function toBbsNarrative(value: unknown): BbsNarrative {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const text = (key: string) => (typeof v[key] === 'string' ? (v[key] as string) : '')
  return {
    whatIsHappening: text('whatIsHappening'),
    whatIsTheConcern: text('whatIsTheConcern'),
    whatSupportsStability: text('whatSupportsStability'),
    whatRequiresInvestigation: text('whatRequiresInvestigation'),
    whatShouldBbsDoNext: text('whatShouldBbsDoNext'),
  }
}

/**
 * Hand-rolled validation (no zod/ajv — same convention as
 * parseDebtDiagnosisFindings above). Never throws: malformed, partial, or
 * non-JSON model output all degrade to a safe, honestly-empty structure
 * rather than crashing the analysis job.
 */
export function parseFinancialAssessmentFindings(rawText: string): FinancialAssessmentFindings {
  const stripped = stripMarkdownFence(rawText)
  const { parsed, sourceWasJson } = parseModelJson(stripped, 'executiveSummary')

  const text = (key: string): string => (typeof parsed[key] === 'string' ? (parsed[key] as string) : '')

  return {
    executiveSummary: resolveNarrativeField(parsed, 'executiveSummary', sourceWasJson, stripped),
    financialPosition: text('financialPosition'),
    strengths: toFinancialFindingArray(parsed.strengths),
    concerns: toFinancialFindingArray(parsed.concerns),
    liquidityAssessment: text('liquidityAssessment'),
    cashFlowAssessment: text('cashFlowAssessment'),
    incomeAssessment: text('incomeAssessment'),
    debtServicingAssessment: text('debtServicingAssessment'),
    borrowingAssessment: text('borrowingAssessment'),
    transactionBehaviourAssessment: text('transactionBehaviourAssessment'),
    creditCorrelationAssessment: text('creditCorrelationAssessment'),
    possibleDrivers: toFinancialFindingArray(parsed.possibleDrivers),
    dataGaps: toFinancialFindingArray(parsed.dataGaps),
    investigationPriorities: toFinancialFindingArray(parsed.investigationPriorities),
    actionPriorities: toActionPriorityArray(parsed.actionPriorities),
    overallAssessment: toBbsNarrative(parsed.overallAssessment),
  }
}

// --- MASTER_PROFILE_INSIGHTS parsing (hand-rolled validation, same convention as above — no zod) ---

function toMasterProfileEvidenceLevel(value: unknown): MasterProfileEvidenceLevel {
  return value === 'KNOWN' || value === 'DERIVED' || value === 'INDICATED' || value === 'UNKNOWN' ? value : 'UNKNOWN'
}

function toMasterProfileSeverity(value: unknown): MasterProfileSeverity {
  return value === 'Positive' || value === 'Informational' || value === 'Attention' || value === 'Elevated' || value === 'Critical' ? value : 'Informational'
}

function toSourceModulesArray(value: unknown): MasterProfileSourceModule[] {
  return Array.isArray(value) ? value.filter((v): v is MasterProfileSourceModule => v === 'DEBT_ANALYSIS' || v === 'FINANCIAL_ANALYSIS') : []
}

/** Drops anything that isn't at least a real {title, statement} pair — never fabricates a finding's core text out of missing fields. */
function toMasterProfileFinding(value: unknown): MasterProfileFinding | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.title !== 'string' || typeof v.statement !== 'string') return null
  return {
    type: typeof v.type === 'string' ? v.type : 'general',
    severity: toMasterProfileSeverity(v.severity),
    title: v.title,
    statement: v.statement,
    evidence: stringArrayField(v.evidence),
    evidenceLevel: toMasterProfileEvidenceLevel(v.evidenceLevel),
    confidence: toConfidence(v.confidence),
    sourceModules: toSourceModulesArray(v.sourceModules),
    relatedDebtAccounts: stringArrayField(v.relatedDebtAccounts),
    relatedFinancialMetrics: stringArrayField(v.relatedFinancialMetrics),
  }
}

function toMasterProfileFindingArray(value: unknown): MasterProfileFinding[] {
  return Array.isArray(value) ? value.map(toMasterProfileFinding).filter((f): f is MasterProfileFinding => f !== null) : []
}

/**
 * Hand-rolled validation (no zod/ajv — same convention as
 * parseDebtDiagnosisFindings/parseFinancialAssessmentFindings above). Never
 * throws: malformed, partial, or non-JSON model output all degrade to a
 * safe, honestly-empty structure rather than crashing the analysis job.
 * Deliberately never reads an `alignmentState`/`resolutionCapacity`/
 * `cohortAttributes` key off the AI response even if one is present — those
 * are deterministic fields set by master-profile.service.ts, never by this
 * parser.
 */
export function parseMasterProfileAssessmentFindings(rawText: string): MasterProfileAssessmentFindings {
  const stripped = stripMarkdownFence(rawText)
  const { parsed, sourceWasJson } = parseModelJson(stripped, 'executiveProfile')

  const text = (key: string): string => (typeof parsed[key] === 'string' ? (parsed[key] as string) : '')

  return {
    executiveProfile: resolveNarrativeField(parsed, 'executiveProfile', sourceWasJson, stripped),
    currentPosition: text('currentPosition'),
    creditPosition: text('creditPosition'),
    financialPosition: text('financialPosition'),
    debtBurden: text('debtBurden'),
    repaymentCapacity: text('repaymentCapacity'),
    liquidityAssessment: text('liquidityAssessment'),
    stressAssessment: text('stressAssessment'),
    alignmentExplanation: text('alignmentExplanation'),
    strengths: toMasterProfileFindingArray(parsed.strengths),
    concerns: toMasterProfileFindingArray(parsed.concerns),
    opportunitySignals: toMasterProfileFindingArray(parsed.opportunitySignals),
    possibleCauses: toMasterProfileFindingArray(parsed.possibleCauses),
    keyContradictions: toMasterProfileFindingArray(parsed.keyContradictions),
    validationRequired: toMasterProfileFindingArray(parsed.validationRequired),
    resolutionReadinessNarrative: text('resolutionReadinessNarrative'),
    confidence: toConfidence(parsed.confidence),
  }
}

// --- RECOVERY_PLAN_GENERATION parsing (hand-rolled validation, same convention as above — no zod) ---

/**
 * Hand-rolled validation (no zod/ajv). Never throws: malformed, partial,
 * or non-JSON model output all degrade to a safe, honestly-empty
 * structure rather than crashing the analysis job. This parser never
 * reads a cohort/template/action/condition/target key off the AI
 * response even if one is present — those are deterministic fields set
 * by plan-engine.service.ts, never by this parser (spec's own AI
 * Guardrails).
 */
export function parseBbsPlanNarrative(rawText: string): BbsPlanNarrative {
  const stripped = stripMarkdownFence(rawText)
  const { parsed, sourceWasJson } = parseModelJson(stripped, 'whereYouAreToday')

  const text = (key: string): string => (typeof parsed[key] === 'string' ? (parsed[key] as string) : '')

  return {
    whereYouAreToday: resolveNarrativeField(parsed, 'whereYouAreToday', sourceWasJson, stripped),
    whatNeedsAttention: text('whatNeedsAttention'),
    whyThisPlan: text('whyThisPlan'),
    whatHappensFirst: text('whatHappensFirst'),
    yourJourney: text('yourJourney'),
    whatBbsWillDo: text('whatBbsWillDo'),
    whatWeNeedFromYou: text('whatWeNeedFromYou'),
    lenderDependencies: text('lenderDependencies'),
    whatCanChangeThePlan: text('whatCanChangeThePlan'),
    howProgressIsMeasured: text('howProgressIsMeasured'),
    reviewDate: text('reviewDate'),
    confidence: toConfidence(parsed.confidence),
  }
}
