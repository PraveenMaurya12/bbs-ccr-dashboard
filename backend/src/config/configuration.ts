export interface AppConfig {
  nodeEnv: string
  port: number
  corsOrigins: string[]
  /**
   * How many reverse-proxy hops in front of this server to trust when
   * resolving the real client IP (Express's `trust proxy`, applied once in
   * main.ts's configureApp) — 0 means "trust none" (req.ip is the raw
   * socket address; safe for local dev, where there is no real proxy).
   * The documented production target (DEPLOYMENT.md) is a single Render
   * Web Service, i.e. exactly one trusted edge-proxy hop — set to 1 there.
   * Never set this higher than the real, known number of trusted hops:
   * doing so would let an untrusted direct client spoof X-Forwarded-For.
   */
  trustProxyHops: number
  jwt: {
    accessSecret: string
    accessTtl: string
    refreshSecret: string
    refreshTtl: string
  }
  bcryptSaltRounds: number
  publicContact: {
    /** Additional CORS origins for the public website's contact form, kept separate from the CCR dashboard's own `corsOrigins`. */
    siteOrigins: string[]
    otpProvider: string
    otpTicketSecret: string
    panHashPepper: string
  }
  documents: {
    /** "local" is the only implemented provider — see modules/documents/storage. */
    storageProvider: string
    /** Where LocalDiskStorageProvider writes files in local/dev — never a publicly-served static path. */
    localStorageDir: string
    maxFileSizeBytes: number
    /** Signs the short-lived (2 min) ticket that lets "View" open a document in a real new browser tab — see modules/documents/view-ticket.ts. */
    viewTicketSecret: string
  }
  bureau: {
    /** "mock" (default, safe everywhere), "signzy" (primary production provider), or "experian" (legacy, retained) — see modules/bureau/providers. */
    creditReportProvider: string
    experian: {
      soapEndpoint: string
      /** SOAP namespace for the `process` operation (xmlns for the `ngws` prefix). */
      soapNamespace: string
      xmlUser: string
      xmlPassword: string
      requestTimeoutMs: number
    }
    signzy: {
      apiBaseUrl: string
      apiKey: string
      requestTimeoutMs: number
    }
  }
  analysis: {
    /** "mock" (default), "gemini", or "claude" — see modules/analysis/providers. */
    aiProvider: string
    gemini: {
      apiKey: string
      model: string
      requestTimeoutMs: number
      /**
       * Gemini 3.x's own latency/reasoning-effort knob (generationConfig.
       * thinkingConfig.thinkingLevel: "low"|"medium"|"high") — replaces the
       * numeric thinkingBudget used by Gemini 2.5. Empty string omits the
       * field entirely (for a configured model that doesn't support
       * thinking at all); see GeminiAiProvider's own doc comment for why
       * this is model-dependent and must be revisited if GEMINI_MODEL
       * changes to a non-thinking model.
       */
      thinkingLevel: string
    }
    claude: {
      apiKey: string
      model: string
      requestTimeoutMs: number
      /**
       * The Anthropic Messages API's `output_config.effort` level
       * ("low"|"medium"|"high"|"xhigh"|"max") — a genuine request parameter
       * on the Messages API, NOT the same thing as Claude Code's own CLI
       * effort setting. Empty string omits `output_config` entirely,
       * letting the model use its own API default.
       */
      effort: string
      /**
       * `max_tokens` on the Messages API request. The structured-JSON
       * prompts this provider serves (Master Profile/Debt Analysis/
       * Financial Analysis insights, each with several Finding[] arrays)
       * can genuinely need more than a few thousand output tokens — a
       * live run against the real API with the previous hardcoded 8192
       * was confirmed truncating mid-response (`stop_reason: "max_tokens"`),
       * which produced an incomplete JSON payload. 16384 is a deliberately
       * generous default; `callClaudeRaw` also detects a truncated
       * response explicitly rather than ever parsing a partial JSON body.
       */
      maxOutputTokens: number
      /**
       * Only required for an API key that is user-scoped rather than
       * workspace-scoped (Anthropic key prefix `sk-ant-usr-...` vs the
       * standard `sk-ant-api03-...`) — sent as the `anthropic-workspace-id`
       * header. Empty string omits the header entirely.
       */
      workspaceId: string
    }
  }
  /**
   * Every threshold/tolerance the Financial Analysis module's deterministic
   * rules use, named and overridable in one place rather than hardcoded
   * inside calculation functions — see modules/financial-analysis. Each is
   * a new BBS-established convention proposed with reasoning (the spec
   * states the rule but not every exact number), same self-labeling
   * discipline as e.g. debt-analysis's HIGH_UTILIZATION_ACCOUNT_THRESHOLD.
   */
  financialAnalysis: {
    /** Rule 11 (Liquidity): a day's balance below this is a "tight-liquidity event." */
    lowBalanceThresholdRupees: number
    /** Rule 18 (Large/Unusual Transactions): amount >= MAX(this, largeTransactionIncomeMultiplier × median monthly income). */
    largeTransactionMinimumRupees: number
    largeTransactionIncomeMultiplier: number
    /** F01: minimum distinct months of matching credits before a recurring-income pattern is ever asserted (never inferred from one transaction — D08). */
    recurringIncomeMinMonths: number
    recurringIncomeAmountToleranceFraction: number
    /** EMI/debt-payment recurring-cluster detection: tighter floor/tolerance than income, since auto-debits are more mechanical (never inferred from one transaction — D09). */
    recurringDebtMinMonths: number
    recurringDebtAmountToleranceFraction: number
    /** Credit-report correlation: how close a detected recurring debit must be to CreditAccount.monthlyEmiAmount to count as a match signal. */
    creditCorrelationAmountToleranceFraction: number
    /** Rule 16/21 (Exceptional Month): monthly inflow > this × trailing-12-month MEDIAN (never a mean — D10) flags the month exceptional. */
    exceptionalMonthInflowMultiplier: number
    /** DR/CR inversion detection: minimum usable balance-pair transitions before a verdict is even considered (never asserted from a handful of rows). */
    directionInversionMinSampleSize: number
    /** DR/CR inversion detection: fraction of evaluated transitions that must agree with one reading before it's asserted — a genuinely mixed/ambiguous statement stays at the conventional default. */
    directionInversionConfidenceThreshold: number
    /** Opening+credits-debits=closing balance reconciliation: the running-balance gap (rupees) tolerated before the statement is flagged RECONCILIATION_FAILED — allows for routine paise-level rounding, never a material mismatch. */
    balanceReconciliationToleranceRupees: number
    /** FCF reconciliation (theoretical vs actual net cash flow): |gap| as a percentage of |theoretical FCF| above this is FCF_UNRECONCILED. New BBS threshold, no spec'd exact number — "approximately matches" is the spec's own phrasing. */
    fcfUnreconciledGapPercentThreshold: number
    /** Data Quality Score: share of transactions left UNCLASSIFIED above this caps the final score at dataQualityUnclassifiedCapPoints. */
    dataQualityUnclassifiedSharePercentThreshold: number
    dataQualityUnclassifiedCapPoints: number
    /** Data Quality Score: cap applied when OTHER_ACCOUNTS_LIKELY is flagged for this statement. */
    dataQualityOtherAccountsCapPoints: number
    /** Data Quality Score: cap applied when FCF_UNRECONCILED is flagged for this statement. */
    dataQualityFcfUnreconciledCapPoints: number
    /** Data Quality Score: cap applied when the balance-reconciliation check fails outright. */
    dataQualityReconciliationFailedCapPoints: number
    /** Data Quality Score: cap applied when BUSINESS_PERSONAL_MIXED is flagged for this statement (v4.0 spec §12.2's 5th named cap — previously missing). */
    dataQualityBusinessPersonalMixedCapPoints: number
    /** Income Stability: largest single recurring source's share of total normalized income above this is SINGLE_SOURCE_DEPENDENCY. */
    singleSourceDependencyThresholdPercent: number
    /** Self-transfer CREDIT volume (proxy for funds routed to an account the customer holds elsewhere) as a share of normalized income above this is OTHER_ACCOUNTS_LIKELY — a proxy only; this statement alone cannot confirm the receiving account is at another bank. */
    otherAccountsLikelyIncomeSharePercent: number
    /** Large Recurring Transfer: minimum occurrences, minimum total volume, and minimum per-transfer average (rupees) before a recurring P2P counterparty is flagged LARGE_RECURRING_TRANSFER. */
    largeRecurringTransferMinOccurrences: number
    largeRecurringTransferMinTotalRupees: number
    largeRecurringTransferMinAverageRupees: number
    /** An LRT counterparty's total volume at or above this is banded LRT_HIGH rather than LRT_MEDIUM — a severity label only. */
    largeRecurringTransferHighVolumeRupees: number
    bonusSalaryMultiplier: number
    incomeTransitionDeltaPercentThreshold: number
    medicalShockThresholdRupees: number
    medicalShockIncomeSharePercent: number
    chronicMedicalMinMonths: number
    relatedPartyEmployerNames: string[]
    incomeDayOfMonthMaxStdDevDays: number
  }
  cohortEngine: {
    /** R008 (Overdue threshold): total overdue above this is a mandatory capacity/review trigger — NOT automatic rejection. Pilot V1, sourced verbatim from the Cohort Decision Engine workbook — requires Credit/Risk/Compliance sign-off before production. */
    overdueCapacityTriggerRupees: number
    /** R011 (Enquiry burst): enquiries in the trailing 30 days above this count toward the C5 debt-cycle signal (not standalone). Pilot V1, sourced verbatim from the workbook. */
    enquiryBurstThreshold30d: number
    /** R012 (Stacking index): new accounts/year above this count toward the C5 debt-cycle signal. Pilot V1, sourced verbatim from the workbook — "fix denominator definition" per the workbook's own note; this uses the trailing-12-month window Debt Analysis already computes. */
    stackingIndexPerYear: number
    /** R013 (Active overdue ratio): total overdue ÷ total active debt above this is a severe signal increasing C3/C4/C5 review weight. Pilot V1, sourced verbatim from the workbook. */
    activeOverdueRatioThreshold: number
    /** R015/R016/R017 (Capacity bands): capacity ratio below this (and >= 0) is STRESSED. Pilot V1 — "validate on pilot data" per both source documents. */
    stressedCapacityRatioMax: number
    /** Capacity ratio below this (and >= stressedCapacityRatioMax) is TIGHT; at or above it is COMFORTABLE. Pilot V1. */
    tightCapacityRatioMax: number
    /** R018 (Stabilisation coverage): coverage at or above this is STRONG. Pilot V1. */
    stabilisationCoverageStrongMin: number
    /** Coverage at or above this (and below stabilisationCoverageStrongMin) requires CCR review; below it, the standard offer is not eligible. Pilot V1. */
    stabilisationCoverageMinimum: number
    /** A plain, manually-bumped version string stamped on every CohortDecision — not a dynamic policy-admin table (see CohortDecision's own schema doc comment for why). */
    ruleVersion: string
    /** v3.0 §9.4/§6.1: post-statement debt at or below this % of total active debt is informational-only (POST_STATEMENT_MINOR). */
    postStatementMinorMaxPercent: number
    /** v3.0 §9.4: post-statement debt above postStatementMinorMaxPercent and at/below this % is POST_STATEMENT_MATERIAL (refresh recommended, not blocking). Above this % is POST_STATEMENT_BLOCKING -> BLOCKED/DATA_REFRESH_REQUIRED. */
    postStatementMaterialMaxPercent: number
    /** v3.0 §9.3: other-accounts self-transfer income share at or below this % is informational-only. */
    otherAccountsMinorMaxPercent: number
    /** v3.0 §9.3: above otherAccountsMinorMaxPercent and at/below this % flags OTHER_ACCOUNTS_MINOR; above this % -> BLOCKED/OTHER_ACCOUNTS_REQUIRED. */
    otherAccountsFlagMaxPercent: number
    /** v3.0 §9.5: P1 missing-information item count at/above this forces BLOCKED/P1_INFORMATION_REQUIRED (0 proceeds, 1-3 flags LIMITED_DATA). */
    p1ForceBlockThreshold: number
    /** v3.0 §9.6: exception count (Master Profile's own dataQuality.flags.length) at/above this (and below exceptionManualReviewThreshold) requires BLOCKED/SPECIALIST_REQUIRED. */
    exceptionSpecialistThreshold: number
    /** v3.0 §9.6: exception count at/above this requires BLOCKED/MANUAL_REVIEW_REQUIRED (the more severe of the two exception thresholds). */
    exceptionManualReviewThreshold: number
    /** v3.0 §7.2: compliance SLA hours by trigger-type — related-party (employer/family), regulatory (PEP/sanctions/fraud), and legal-status triggers each get their own clock. */
    complianceSlaRelatedPartyHours: number
    complianceSlaRegulatoryHours: number
    complianceSlaLegalHours: number
    /** v3.0 §14.2: TTL (days) for each BLOCKED reason code before the documented post-TTL action (notify/cancel/escalate) applies — computed on read, never a cron job (same discipline as Master Profile's own freshness TTL). */
    ttlConsentPendingDays: number
    ttlKycPendingDays: number
    ttlDataRefreshRequiredDays: number
    ttlOtherAccountsRequiredDays: number
    ttlP1InformationRequiredDays: number
    ttlManualReviewRequiredDays: number
    ttlSpecialistRequiredDays: number
  }
  /**
   * The BBS Plan Engine's own, minimal pilot config — most of what the
   * spec calls "policy" lives in the static Template Registry (see
   * modules/plan-engine/templates), not here. See BbsPlan's own schema
   * doc comment for why there's no dynamic policy-admin table.
   */
  planEngine: {
    /** Default Day-N review cadence stamped onto every generated plan's monitoring schedule — data, not an actually-scheduled job (no scheduler infra exists in this codebase; same convention as Cohort Engine's own nextReviewEvent). Pilot V1. */
    reviewCadenceDays: number[]
    /** A plain, manually-bumped version string stamped on every BbsPlan's templateVersion — not a dynamic policy-admin table. */
    templateRegistryVersion: string
    /** v3.0 §7 rule-catalog version, stamped onto every PL00x rule result — mirrors Cohort/Pathway Engine's own ruleVersion stamping. */
    ruleVersion: string
    /** v3.0 §12.5 per-pathway plan TTL (days) — bounded by L5's own pathway, same discipline as Pathway Engine's own ttlDaysByPathway. Pilot V1, requires Business/Risk sign-off. */
    ttlDaysByPathway: { OPTIMISE: number; STABILISE: number; CONSOLIDATE: number; RESTRUCTURE: number; RESOLVE: number; RECOVER: number }
    /** v3.0 §5.1 — placeholder_ttl_days for a BLOCKED/thin plan (X1/X2/C6/pending-resolution). Pilot V1. */
    placeholderTtlDays: number
  }
  /**
   * BBS Pathway Engine Module v3.0 (L5) — Pilot V1, requires Business/
   * Credit/Risk sign-off before production, same caveat as every other
   * pilot-threshold block in this file. §12's own fixed per-pathway TTL
   * table and §4.3's own DQ-band confidence-ceiling table.
   */
  pathwayEngine: {
    ruleVersion: string
    ttlDaysByPathway: { OPTIMISE: number; STABILISE: number; CONSOLIDATE: number; RESTRUCTURE: number; RESOLVE: number; RECOVER: number }
    confidenceCapByDqBand: { HIGH: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRESOLVED'; MODERATE: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRESOLVED'; LOW_MODERATE: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRESOLVED'; LOW: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRESOLVED'; INSUFFICIENT: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRESOLVED' }
  }
}

export default (): { app: AppConfig } => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3001', 10),
    corsOrigins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxyHops: parseInt(process.env.TRUST_PROXY_HOPS ?? '0', 10),
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
      accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
      refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
      refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    },
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12', 10),
    publicContact: {
      siteOrigins: (process.env.PUBLIC_SITE_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      otpProvider: process.env.OTP_PROVIDER ?? 'mock',
      otpTicketSecret: process.env.PUBLIC_OTP_TICKET_SECRET ?? '',
      panHashPepper: process.env.PAN_HASH_PEPPER ?? '',
    },
    documents: {
      storageProvider: process.env.DOCUMENT_STORAGE_PROVIDER ?? 'local',
      localStorageDir: process.env.DOCUMENT_LOCAL_STORAGE_DIR ?? 'storage/documents',
      maxFileSizeBytes: parseInt(process.env.DOCUMENT_MAX_FILE_SIZE_BYTES ?? '10485760', 10), // 10 MB
      viewTicketSecret: process.env.DOCUMENT_VIEW_TICKET_SECRET ?? '',
    },
    bureau: {
      creditReportProvider: process.env.CREDIT_REPORT_PROVIDER ?? 'mock',
      experian: {
        soapEndpoint: process.env.EXPERIAN_SOAP_ENDPOINT ?? 'https://connect.experian.in:8443/ngwsconnect/ngws',
        soapNamespace: process.env.EXPERIAN_SOAP_NAMESPACE ?? 'http://nextgenws.ngwsconnect.experian.com',
        xmlUser: process.env.EXPERIAN_XML_USER ?? '',
        xmlPassword: process.env.EXPERIAN_XML_PASSWORD ?? '',
        requestTimeoutMs: parseInt(process.env.EXPERIAN_REQUEST_TIMEOUT_MS ?? '20000', 10),
      },
      signzy: {
        apiBaseUrl: process.env.SIGNZY_API_BASE_URL ?? 'https://api.signzy.app',
        apiKey: process.env.SIGNZY_API_KEY ?? '',
        requestTimeoutMs: parseInt(process.env.SIGNZY_REQUEST_TIMEOUT_MS ?? '20000', 10),
      },
    },
    analysis: {
      aiProvider: process.env.AI_PROVIDER ?? 'mock',
      gemini: {
        apiKey: process.env.GEMINI_API_KEY ?? '',
        // Overridable — verify the exact model id against the current
        // Gemini API docs at deploy time rather than trusting this default
        // to remain the right choice indefinitely.
        model: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
        // A real thinking-capable model (confirmed live for gemini-3.8-flash
        // via its own /v1beta/models/{model} metadata: "thinking": true) can
        // take well over 20s even at its fastest reasoning-effort setting —
        // public benchmarks put even "low" thinkingLevel at ~48s/task
        // average. 20000 was a legacy non-thinking-model-era default that
        // caused every real call to abort before Gemini could respond.
        requestTimeoutMs: parseInt(process.env.GEMINI_REQUEST_TIMEOUT_MS ?? '120000', 10),
        // "low" minimizes reasoning latency for this module's use case
        // (structured advisory JSON, not multi-step reasoning) — set to
        // '' to omit thinkingConfig entirely for a configured model that
        // doesn't support thinking at all.
        thinkingLevel: process.env.GEMINI_THINKING_LEVEL ?? 'low',
      },
      claude: {
        apiKey: process.env.ANTHROPIC_API_KEY ?? '',
        // Overridable — confirmed live against this project's own API key
        // (both claude-sonnet-5 and claude-sonnet-5-5 responded 200); this
        // default is the current flagship Sonnet, not the legacy one.
        // Re-verify at deploy time rather than trusting this indefinitely.
        model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-5-5',
        requestTimeoutMs: parseInt(process.env.CLAUDE_REQUEST_TIMEOUT_MS ?? '120000', 10),
        effort: process.env.CLAUDE_EFFORT ?? 'medium',
        // 16384, not the Messages API's own much higher ceiling: a live run
        // against the real API with the old hardcoded 8192 was confirmed
        // truncating mid-JSON for this module's more detailed prompts (see
        // this field's own doc comment in configuration.ts's type above).
        maxOutputTokens: parseInt(process.env.CLAUDE_MAX_OUTPUT_TOKENS ?? '16384', 10),
        workspaceId: process.env.ANTHROPIC_WORKSPACE_ID ?? '',
      },
    },
    financialAnalysis: {
      lowBalanceThresholdRupees: parseInt(process.env.FINANCIAL_LOW_BALANCE_THRESHOLD_RUPEES ?? '1000', 10),
      largeTransactionMinimumRupees: parseInt(process.env.FINANCIAL_LARGE_TRANSACTION_MINIMUM_RUPEES ?? '25000', 10),
      largeTransactionIncomeMultiplier: parseFloat(process.env.FINANCIAL_LARGE_TRANSACTION_INCOME_MULTIPLIER ?? '0.5'),
      recurringIncomeMinMonths: parseInt(process.env.FINANCIAL_RECURRING_INCOME_MIN_MONTHS ?? '3', 10),
      recurringIncomeAmountToleranceFraction: parseFloat(process.env.FINANCIAL_RECURRING_INCOME_TOLERANCE ?? '0.15'),
      recurringDebtMinMonths: parseInt(process.env.FINANCIAL_RECURRING_DEBT_MIN_MONTHS ?? '2', 10),
      recurringDebtAmountToleranceFraction: parseFloat(process.env.FINANCIAL_RECURRING_DEBT_TOLERANCE ?? '0.05'),
      creditCorrelationAmountToleranceFraction: parseFloat(process.env.FINANCIAL_CREDIT_CORRELATION_TOLERANCE ?? '0.1'),
      exceptionalMonthInflowMultiplier: parseFloat(process.env.FINANCIAL_EXCEPTIONAL_MONTH_MULTIPLIER ?? '1.5'),
      // Pilot V1 — requires Credit/Risk/Compliance sign-off. Confirmed via a
      // real customer's statement where balance-delta math proved ALL 1567
      // rows' DR/CR columns were inverted relative to the running balance —
      // these two thresholds are what stop that same deterministic check
      // from ever firing on a small or genuinely ambiguous sample.
      directionInversionMinSampleSize: parseInt(process.env.FINANCIAL_DIRECTION_INVERSION_MIN_SAMPLE_SIZE ?? '20', 10),
      directionInversionConfidenceThreshold: parseFloat(process.env.FINANCIAL_DIRECTION_INVERSION_CONFIDENCE_THRESHOLD ?? '0.95'),
      balanceReconciliationToleranceRupees: parseInt(process.env.FINANCIAL_BALANCE_RECONCILIATION_TOLERANCE_RUPEES ?? '100', 10),
      fcfUnreconciledGapPercentThreshold: parseFloat(process.env.FINANCIAL_FCF_UNRECONCILED_GAP_PERCENT ?? '30'),
      dataQualityUnclassifiedSharePercentThreshold: parseFloat(process.env.FINANCIAL_DATA_QUALITY_UNCLASSIFIED_SHARE_PERCENT ?? '10'),
      dataQualityUnclassifiedCapPoints: parseInt(process.env.FINANCIAL_DATA_QUALITY_UNCLASSIFIED_CAP ?? '75', 10),
      dataQualityOtherAccountsCapPoints: parseInt(process.env.FINANCIAL_DATA_QUALITY_OTHER_ACCOUNTS_CAP ?? '80', 10),
      dataQualityFcfUnreconciledCapPoints: parseInt(process.env.FINANCIAL_DATA_QUALITY_FCF_UNRECONCILED_CAP ?? '75', 10),
      dataQualityReconciliationFailedCapPoints: parseInt(process.env.FINANCIAL_DATA_QUALITY_RECONCILIATION_FAILED_CAP ?? '50', 10),
      dataQualityBusinessPersonalMixedCapPoints: parseInt(process.env.FINANCIAL_DATA_QUALITY_BUSINESS_PERSONAL_MIXED_CAP ?? '78', 10),
      singleSourceDependencyThresholdPercent: parseFloat(process.env.FINANCIAL_SINGLE_SOURCE_DEPENDENCY_THRESHOLD_PERCENT ?? '90'),
      otherAccountsLikelyIncomeSharePercent: parseFloat(process.env.FINANCIAL_OTHER_ACCOUNTS_LIKELY_INCOME_SHARE_PERCENT ?? '10'),
      largeRecurringTransferMinOccurrences: parseInt(process.env.FINANCIAL_LRT_MIN_OCCURRENCES ?? '3', 10),
      largeRecurringTransferMinTotalRupees: parseInt(process.env.FINANCIAL_LRT_MIN_TOTAL_RUPEES ?? '100000', 10),
      largeRecurringTransferMinAverageRupees: parseInt(process.env.FINANCIAL_LRT_MIN_AVERAGE_RUPEES ?? '25000', 10),
      largeRecurringTransferHighVolumeRupees: parseInt(process.env.FINANCIAL_LRT_HIGH_VOLUME_RUPEES ?? '200000', 10),
      bonusSalaryMultiplier: parseFloat(process.env.FINANCIAL_BONUS_SALARY_MULTIPLIER ?? '1.5'),
      incomeTransitionDeltaPercentThreshold: parseFloat(process.env.FINANCIAL_INCOME_TRANSITION_DELTA_PERCENT ?? '15'),
      medicalShockThresholdRupees: parseInt(process.env.FINANCIAL_MEDICAL_SHOCK_THRESHOLD_RUPEES ?? '10000', 10),
      medicalShockIncomeSharePercent: parseFloat(process.env.FINANCIAL_MEDICAL_SHOCK_INCOME_SHARE_PERCENT ?? '20'),
      chronicMedicalMinMonths: parseInt(process.env.FINANCIAL_CHRONIC_MEDICAL_MIN_MONTHS ?? '3', 10),
      // Pilot V1 — empty by default. This module never hardcodes a specific
      // employer name (that would be baking a test-case fact into general
      // policy) — BBS must populate this via env with its own real,
      // verified affiliate/subsidiary legal names before RELATED_PARTY_EMPLOYER
      // can ever fire. Comma-separated env override.
      relatedPartyEmployerNames: (process.env.FINANCIAL_RELATED_PARTY_EMPLOYER_NAMES ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      incomeDayOfMonthMaxStdDevDays: parseFloat(process.env.FINANCIAL_INCOME_DAY_OF_MONTH_MAX_STDDEV_DAYS ?? '5'),
    },
    cohortEngine: {
      overdueCapacityTriggerRupees: parseInt(process.env.COHORT_OVERDUE_CAPACITY_TRIGGER_RUPEES ?? '100000', 10),
      enquiryBurstThreshold30d: parseInt(process.env.COHORT_ENQUIRY_BURST_THRESHOLD_30D ?? '4', 10),
      stackingIndexPerYear: parseInt(process.env.COHORT_STACKING_INDEX_PER_YEAR ?? '15', 10),
      activeOverdueRatioThreshold: parseFloat(process.env.COHORT_ACTIVE_OVERDUE_RATIO_THRESHOLD ?? '0.60'),
      stressedCapacityRatioMax: parseFloat(process.env.COHORT_STRESSED_CAPACITY_RATIO_MAX ?? '0.10'),
      tightCapacityRatioMax: parseFloat(process.env.COHORT_TIGHT_CAPACITY_RATIO_MAX ?? '0.20'),
      stabilisationCoverageStrongMin: parseFloat(process.env.COHORT_STABILISATION_COVERAGE_STRONG_MIN ?? '1.25'),
      stabilisationCoverageMinimum: parseFloat(process.env.COHORT_STABILISATION_COVERAGE_MINIMUM ?? '1.00'),
      ruleVersion: process.env.COHORT_RULE_VERSION ?? 'BBS_COHORT_V3.0',
      postStatementMinorMaxPercent: parseFloat(process.env.COHORT_POST_STATEMENT_MINOR_MAX_PERCENT ?? '10'),
      postStatementMaterialMaxPercent: parseFloat(process.env.COHORT_POST_STATEMENT_MATERIAL_MAX_PERCENT ?? '30'),
      otherAccountsMinorMaxPercent: parseFloat(process.env.COHORT_OTHER_ACCOUNTS_MINOR_MAX_PERCENT ?? '5'),
      otherAccountsFlagMaxPercent: parseFloat(process.env.COHORT_OTHER_ACCOUNTS_FLAG_MAX_PERCENT ?? '10'),
      p1ForceBlockThreshold: parseInt(process.env.COHORT_P1_FORCE_BLOCK_THRESHOLD ?? '4', 10),
      exceptionSpecialistThreshold: parseInt(process.env.COHORT_EXCEPTION_SPECIALIST_THRESHOLD ?? '5', 10),
      exceptionManualReviewThreshold: parseInt(process.env.COHORT_EXCEPTION_MANUAL_REVIEW_THRESHOLD ?? '8', 10),
      complianceSlaRelatedPartyHours: parseInt(process.env.COHORT_COMPLIANCE_SLA_RELATED_PARTY_HOURS ?? '72', 10),
      complianceSlaRegulatoryHours: parseInt(process.env.COHORT_COMPLIANCE_SLA_REGULATORY_HOURS ?? '24', 10),
      complianceSlaLegalHours: parseInt(process.env.COHORT_COMPLIANCE_SLA_LEGAL_HOURS ?? '120', 10),
      ttlConsentPendingDays: parseInt(process.env.COHORT_TTL_CONSENT_PENDING_DAYS ?? '30', 10),
      ttlKycPendingDays: parseInt(process.env.COHORT_TTL_KYC_PENDING_DAYS ?? '30', 10),
      ttlDataRefreshRequiredDays: parseInt(process.env.COHORT_TTL_DATA_REFRESH_REQUIRED_DAYS ?? '60', 10),
      ttlOtherAccountsRequiredDays: parseInt(process.env.COHORT_TTL_OTHER_ACCOUNTS_REQUIRED_DAYS ?? '30', 10),
      ttlP1InformationRequiredDays: parseInt(process.env.COHORT_TTL_P1_INFORMATION_REQUIRED_DAYS ?? '30', 10),
      ttlManualReviewRequiredDays: parseInt(process.env.COHORT_TTL_MANUAL_REVIEW_REQUIRED_DAYS ?? '15', 10),
      ttlSpecialistRequiredDays: parseInt(process.env.COHORT_TTL_SPECIALIST_REQUIRED_DAYS ?? '30', 10),
    },
    planEngine: {
      reviewCadenceDays: (process.env.PLAN_REVIEW_CADENCE_DAYS ?? '30,60,90')
        .split(',')
        .map((d) => parseInt(d.trim(), 10))
        .filter((d) => !Number.isNaN(d)),
      templateRegistryVersion: process.env.PLAN_TEMPLATE_REGISTRY_VERSION ?? 'BBS_PLAN_V3.0',
      ruleVersion: process.env.PLAN_RULE_VERSION ?? 'BBS_PLAN_V3.0',
      ttlDaysByPathway: {
        OPTIMISE: parseInt(process.env.PLAN_TTL_OPTIMISE_DAYS ?? '90', 10),
        STABILISE: parseInt(process.env.PLAN_TTL_STABILISE_DAYS ?? '30', 10),
        CONSOLIDATE: parseInt(process.env.PLAN_TTL_CONSOLIDATE_DAYS ?? '45', 10),
        RESTRUCTURE: parseInt(process.env.PLAN_TTL_RESTRUCTURE_DAYS ?? '45', 10),
        RESOLVE: parseInt(process.env.PLAN_TTL_RESOLVE_DAYS ?? '60', 10),
        RECOVER: parseInt(process.env.PLAN_TTL_RECOVER_DAYS ?? '180', 10),
      },
      placeholderTtlDays: parseInt(process.env.PLAN_PLACEHOLDER_TTL_DAYS ?? '30', 10),
    },
    pathwayEngine: {
      ruleVersion: process.env.PATHWAY_RULE_VERSION ?? 'BBS_PATHWAY_V3.0',
      ttlDaysByPathway: {
        OPTIMISE: parseInt(process.env.PATHWAY_TTL_OPTIMISE_DAYS ?? '90', 10),
        STABILISE: parseInt(process.env.PATHWAY_TTL_STABILISE_DAYS ?? '30', 10),
        CONSOLIDATE: parseInt(process.env.PATHWAY_TTL_CONSOLIDATE_DAYS ?? '45', 10),
        RESTRUCTURE: parseInt(process.env.PATHWAY_TTL_RESTRUCTURE_DAYS ?? '45', 10),
        RESOLVE: parseInt(process.env.PATHWAY_TTL_RESOLVE_DAYS ?? '60', 10),
        RECOVER: parseInt(process.env.PATHWAY_TTL_RECOVER_DAYS ?? '180', 10),
      },
      confidenceCapByDqBand: { HIGH: 'HIGH', MODERATE: 'MEDIUM', LOW_MODERATE: 'LOW', LOW: 'LOW', INSUFFICIENT: 'UNRESOLVED' },
    },
  },
})
