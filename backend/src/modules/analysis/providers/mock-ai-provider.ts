import { Injectable } from '@nestjs/common'
import { AiProvider } from '@prisma/client'

import type {
  AiAnalysisProvider,
  AnalysisRequest,
  AnalysisResponse,
} from './ai-provider.interface'
import type { BbsPlanNarrative } from './bbs-plan-narrative.types'
import type { DebtDiagnosisFindings } from './debt-diagnosis.types'
import type { FinancialAssessmentFindings } from './financial-assessment.types'
import type { MasterProfileAssessmentFindings } from './master-profile-assessment.types'

/**
 * Development-only mock provider. Produces clearly-labeled synthetic
 * findings and never calls a real external AI service or transmits
 * customer data anywhere. Swap the binding in AnalysisModule for a real
 * `AiAnalysisProvider` implementation once a provider is approved.
 */
@Injectable()
export class MockAiProvider implements AiAnalysisProvider {
  readonly providerName = AiProvider.MOCK

  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    await new Promise((resolve) => setTimeout(resolve, 300))

    // DEBT_ANALYSIS_INSIGHTS gets a fixture matching GeminiAiProvider's real
    // DebtDiagnosisFindings contract exactly — every other job type keeps
    // the original generic mock shape below, untouched by this rebuild.
    if (request.jobType === 'DEBT_ANALYSIS_INSIGHTS') {
      return {
        findings: this.mockDebtDiagnosis(request.leadId) as unknown as Record<string, unknown>,
        confidence: 0.5,
        modelVersion: 'mock-v1',
      }
    }

    // FINANCIAL_ANALYSIS_INSIGHTS gets a fixture matching GeminiAiProvider's
    // real FinancialAssessmentFindings contract exactly — every other job
    // type (including the generic fallback below) is untouched.
    if (request.jobType === 'FINANCIAL_ANALYSIS_INSIGHTS') {
      return {
        findings: this.mockFinancialAssessment(request.leadId) as unknown as Record<string, unknown>,
        confidence: 0.5,
        modelVersion: 'mock-v1',
      }
    }

    // MASTER_PROFILE_INSIGHTS gets a fixture matching GeminiAiProvider's real
    // MasterProfileAssessmentFindings contract exactly — every other job
    // type (including the generic fallback below) is untouched.
    if (request.jobType === 'MASTER_PROFILE_INSIGHTS') {
      return {
        findings: this.mockMasterProfileAssessment(request.leadId) as unknown as Record<string, unknown>,
        confidence: 0.5,
        modelVersion: 'mock-v1',
      }
    }

    // RECOVERY_PLAN_GENERATION (the Plan Engine's own narrative job) gets a
    // fixture matching GeminiAiProvider's real BbsPlanNarrative contract
    // exactly — every other job type (including the generic fallback
    // below) is untouched.
    if (request.jobType === 'RECOVERY_PLAN_GENERATION') {
      return {
        findings: this.mockBbsPlanNarrative(request.leadId) as unknown as Record<string, unknown>,
        confidence: 0.5,
        modelVersion: 'mock-v1',
      }
    }

    return {
      findings: {
        mock: true,
        note: 'Synthetic finding from MockAiProvider — no real AI provider was called.',
        jobType: request.jobType,
        summary: this.summarize(request),
      },
      confidence: 0.5,
      modelVersion: 'mock-v1',
    }
  }

  private mockDebtDiagnosis(leadId: string): DebtDiagnosisFindings {
    return {
      executiveSummary: `Mock debt diagnosis for lead ${leadId} — no real AI provider was called.`,
      currentPosition: 'Mock: accounts are reported current with no active overdue.',
      primaryConcerns: [
        {
          type: 'concentration',
          severity: 'Medium',
          title: 'Mock lender concentration',
          statement: 'Mock: a single lender holds a large share of total outstanding.',
          evidence: ['mock.debtBurden.top1LenderSharePercent'],
          evidenceLevel: 'KNOWN',
          relatedAccounts: [],
          confidence: 'medium',
        },
      ],
      secondaryConcerns: [],
      historicalContext: [],
      debtTrajectory: 'Insufficient data to determine debt trajectory (mock).',
      stressSignals: [],
      possibleDrivers: [
        {
          type: 'root_cause',
          severity: 'Low',
          title: 'Mock possible driver',
          statement: 'Mock: insufficient evidence to indicate a specific driver.',
          evidence: [],
          evidenceLevel: 'UNKNOWN',
          relatedAccounts: [],
          confidence: 'low',
        },
      ],
      dataGaps: ['Mock: income not reported.'],
      accountInsights: [],
      resolutionOpportunities: [],
      actionPlan: { verify: ['Mock: verify income and EMI.'], immediateAttention: [], monitor: [], optimize: [] },
    }
  }

  private mockFinancialAssessment(leadId: string): FinancialAssessmentFindings {
    return {
      executiveSummary: `Mock financial assessment for lead ${leadId} — no real AI provider was called.`,
      financialPosition: 'Mock: income and expenses are broadly balanced with no deficit months observed.',
      strengths: [
        {
          type: 'income_stability',
          severity: 'Positive',
          title: 'Mock stable income',
          statement: 'Mock: a recurring monthly income source was identified across the statement window.',
          evidence: ['mock.components.incomeStability.evidence.band'],
          evidenceLevel: 'CONFIRMED',
          confidence: 'medium',
          relatedTransactions: [],
          relatedMonths: [],
          relatedAccounts: [],
        },
      ],
      concerns: [],
      liquidityAssessment: 'Mock: no tight-liquidity events were observed.',
      cashFlowAssessment: 'Mock: cash flow is positive across the observed months.',
      incomeAssessment: 'Mock: income is classified as stable.',
      debtServicingAssessment: 'Mock: debt service ratio is within a comfortable range.',
      borrowingAssessment: 'Mock: borrowing dependency is low.',
      transactionBehaviourAssessment: 'Mock: transaction activity is unremarkable.',
      creditCorrelationAssessment: 'Mock: no bureau correlation data was available to assess.',
      possibleDrivers: [],
      dataGaps: [
        {
          type: 'data_gap',
          severity: 'Informational',
          title: 'Mock income not reported',
          statement: 'Mock: declared monthly income was not available to cross-check against the statement.',
          evidence: [],
          evidenceLevel: 'CONFIRMED',
          confidence: 'medium',
          relatedTransactions: [],
          relatedMonths: [],
          relatedAccounts: [],
        },
      ],
      investigationPriorities: [],
      actionPriorities: [
        {
          type: 'verify',
          severity: 'Informational',
          title: 'Mock verify income',
          statement: 'Mock: confirm declared income directly with the borrower.',
          evidence: [],
          evidenceLevel: 'CONFIRMED',
          confidence: 'medium',
          relatedTransactions: [],
          relatedMonths: [],
          relatedAccounts: [],
          quadrant: 'VERIFY',
          suggestedNextStep: 'Mock: ask for a recent salary slip.',
        },
      ],
      overallAssessment: {
        whatIsHappening: 'Mock: the borrower shows a stable, low-stress financial profile.',
        whatIsTheConcern: 'Mock: no material concern was identified.',
        whatSupportsStability: 'Mock: consistent recurring income and positive cash flow.',
        whatRequiresInvestigation: 'Mock: declared income was not available to cross-check.',
        whatShouldBbsDoNext: 'Mock: verify income and proceed with standard review.',
      },
    }
  }

  private mockMasterProfileAssessment(leadId: string): MasterProfileAssessmentFindings {
    return {
      executiveProfile: `Mock Master Profile synthesis for lead ${leadId} — no real AI provider was called.`,
      currentPosition: 'Mock: credit and bank-statement evidence are broadly aligned, with no active overdue.',
      creditPosition: 'Mock: credit report shows no current overdue and a moderate debt burden.',
      financialPosition: 'Mock: bank statement shows stable recurring income and positive cash flow.',
      debtBurden: 'Mock: one reconciled EMI obligation is actively being serviced per the bank statement.',
      repaymentCapacity: 'Mock: Bureau, Bank, and Master DSR are all within a comfortable range.',
      liquidityAssessment: 'Mock: no tight-liquidity events were observed.',
      stressAssessment: 'Mock: the combined Master Stress Profile is Stable.',
      alignmentExplanation: 'Mock: classified ALIGNED_HEALTHY because no credit stress and a manageable Master DSR were both observed.',
      strengths: [
        {
          type: 'repayment_capacity',
          severity: 'Positive',
          title: 'Mock regular repayment observed',
          statement: 'Mock: a bureau-reported obligation has a matching recurring bank repayment.',
          evidence: ['mock.reconciliationRows[0].matchStatus'],
          evidenceLevel: 'KNOWN',
          confidence: 'high',
          sourceModules: ['DEBT_ANALYSIS', 'FINANCIAL_ANALYSIS'],
          relatedDebtAccounts: [],
          relatedFinancialMetrics: [],
        },
      ],
      concerns: [],
      opportunitySignals: [],
      possibleCauses: [],
      keyContradictions: [],
      validationRequired: [
        {
          type: 'validation',
          severity: 'Informational',
          title: 'Mock verify other accounts',
          statement: 'Mock: confirm whether all repayments use this one bank account.',
          evidence: [],
          evidenceLevel: 'UNKNOWN',
          confidence: 'low',
          sourceModules: ['FINANCIAL_ANALYSIS'],
          relatedDebtAccounts: [],
          relatedFinancialMetrics: [],
        },
      ],
      resolutionReadinessNarrative: 'Mock: resolution readiness is STRONG given clean credit and capable cash flow.',
      confidence: 'medium',
    }
  }

  private mockBbsPlanNarrative(leadId: string): BbsPlanNarrative {
    return {
      whereYouAreToday: `Mock: a summary of where lead ${leadId} stands today — no real AI provider was called.`,
      whatNeedsAttention: 'Mock: the areas this plan focuses on first.',
      whyThisPlan: 'Mock: why this specific plan was chosen for your situation.',
      whatHappensFirst: 'Mock: the immediate next step.',
      yourJourney: 'Mock: what to expect over the next 30/60/90 days.',
      whatBbsWillDo: 'Mock: the actions BBS is taking on your behalf.',
      whatWeNeedFromYou: 'Mock: the actions you need to take.',
      lenderDependencies: 'Mock: any steps that depend on a lender’s response.',
      whatCanChangeThePlan: 'Mock: the events that would trigger a plan reassessment.',
      howProgressIsMeasured: 'Mock: how success is measured for this plan.',
      reviewDate: 'Mock: the next scheduled review date.',
      confidence: 'medium',
    }
  }

  private summarize(request: AnalysisRequest): string {
    switch (request.jobType) {
      case 'L1_CREDIT_SCREENING':
        return `Mock L1 screening for lead ${request.leadId} at score ${request.creditReport.creditScore}`
      case 'L2_FINANCIAL_ANALYSIS':
        return `Mock L2 analysis for lead ${request.leadId}`
      case 'L3_ASSESSMENT':
        return `Mock L3 holistic assessment for lead ${request.leadId}`
      case 'RECOVERY_PLAN_GENERATION':
        return `Mock recovery plan narrative for lead ${request.leadId}`
      case 'DEBT_ANALYSIS_INSIGHTS':
        return `Mock debt-analysis insights for lead ${request.leadId}`
      case 'FINANCIAL_ANALYSIS_INSIGHTS':
        return `Mock financial-analysis insights for lead ${request.leadId}`
      case 'MASTER_PROFILE_INSIGHTS':
        return `Mock master-profile insights for lead ${request.leadId}`
    }
  }
}
