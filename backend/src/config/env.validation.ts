import { plainToInstance } from 'class-transformer'
import { IsIn, IsInt, IsNumberString, IsOptional, IsString, Max, Min, validateSync } from 'class-validator'

class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV!: string

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT!: number

  @IsString()
  DATABASE_URL!: string

  @IsString()
  CORS_ORIGINS!: string

  @IsOptional()
  @IsInt()
  @Min(0)
  TRUST_PROXY_HOPS?: number

  @IsString()
  JWT_ACCESS_SECRET!: string

  @IsString()
  JWT_ACCESS_TTL!: string

  @IsString()
  JWT_REFRESH_SECRET!: string

  @IsString()
  JWT_REFRESH_TTL!: string

  @IsInt()
  @Min(4)
  @Max(15)
  BCRYPT_SALT_ROUNDS!: number

  @IsOptional()
  @IsString()
  PUBLIC_SITE_ORIGINS?: string

  @IsIn(['mock', 'msg91', 'twilio'])
  OTP_PROVIDER!: string

  @IsString()
  PUBLIC_OTP_TICKET_SECRET!: string

  @IsString()
  PAN_HASH_PEPPER!: string

  @IsOptional()
  @IsIn(['local'])
  DOCUMENT_STORAGE_PROVIDER?: string

  @IsOptional()
  @IsString()
  DOCUMENT_LOCAL_STORAGE_DIR?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  DOCUMENT_MAX_FILE_SIZE_BYTES?: number

  @IsString()
  DOCUMENT_VIEW_TICKET_SECRET!: string

  @IsOptional()
  @IsIn(['mock', 'experian', 'signzy'])
  CREDIT_REPORT_PROVIDER?: string

  @IsOptional()
  @IsString()
  EXPERIAN_SOAP_ENDPOINT?: string

  @IsOptional()
  @IsString()
  EXPERIAN_SOAP_NAMESPACE?: string

  @IsOptional()
  @IsString()
  EXPERIAN_XML_USER?: string

  @IsOptional()
  @IsString()
  EXPERIAN_XML_PASSWORD?: string

  @IsOptional()
  @IsInt()
  @Min(1000)
  EXPERIAN_REQUEST_TIMEOUT_MS?: number

  @IsOptional()
  @IsString()
  SIGNZY_API_BASE_URL?: string

  @IsOptional()
  @IsString()
  SIGNZY_API_KEY?: string

  @IsOptional()
  @IsInt()
  @Min(1000)
  SIGNZY_REQUEST_TIMEOUT_MS?: number

  @IsOptional()
  @IsIn(['mock', 'gemini', 'claude'])
  AI_PROVIDER?: string

  @IsOptional()
  @IsString()
  GEMINI_API_KEY?: string

  @IsOptional()
  @IsString()
  GEMINI_MODEL?: string

  @IsOptional()
  @IsInt()
  @Min(1000)
  GEMINI_REQUEST_TIMEOUT_MS?: number

  @IsOptional()
  @IsIn(['low', 'medium', 'high', ''])
  GEMINI_THINKING_LEVEL?: string

  @IsOptional()
  @IsString()
  ANTHROPIC_API_KEY?: string

  @IsOptional()
  @IsString()
  CLAUDE_MODEL?: string

  @IsOptional()
  @IsInt()
  @Min(1000)
  CLAUDE_REQUEST_TIMEOUT_MS?: number

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'xhigh', 'max', ''])
  CLAUDE_EFFORT?: string

  @IsOptional()
  @IsInt()
  @Min(1024)
  CLAUDE_MAX_OUTPUT_TOKENS?: number

  @IsOptional()
  @IsString()
  ANTHROPIC_WORKSPACE_ID?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  FINANCIAL_LOW_BALANCE_THRESHOLD_RUPEES?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  FINANCIAL_LARGE_TRANSACTION_MINIMUM_RUPEES?: number

  @IsOptional()
  @IsNumberString()
  FINANCIAL_LARGE_TRANSACTION_INCOME_MULTIPLIER?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  FINANCIAL_RECURRING_INCOME_MIN_MONTHS?: number

  @IsOptional()
  @IsNumberString()
  FINANCIAL_RECURRING_INCOME_TOLERANCE?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  FINANCIAL_RECURRING_DEBT_MIN_MONTHS?: number

  @IsOptional()
  @IsNumberString()
  FINANCIAL_RECURRING_DEBT_TOLERANCE?: string

  @IsOptional()
  @IsNumberString()
  FINANCIAL_CREDIT_CORRELATION_TOLERANCE?: string

  @IsOptional()
  @IsNumberString()
  FINANCIAL_EXCEPTIONAL_MONTH_MULTIPLIER?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  FINANCIAL_DIRECTION_INVERSION_MIN_SAMPLE_SIZE?: number

  @IsOptional()
  @IsNumberString()
  FINANCIAL_DIRECTION_INVERSION_CONFIDENCE_THRESHOLD?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  FINANCIAL_BALANCE_RECONCILIATION_TOLERANCE_RUPEES?: number

  @IsOptional()
  @IsNumberString()
  FINANCIAL_FCF_UNRECONCILED_GAP_PERCENT?: string

  @IsOptional()
  @IsNumberString()
  FINANCIAL_DATA_QUALITY_UNCLASSIFIED_SHARE_PERCENT?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  FINANCIAL_DATA_QUALITY_UNCLASSIFIED_CAP?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  FINANCIAL_DATA_QUALITY_OTHER_ACCOUNTS_CAP?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  FINANCIAL_DATA_QUALITY_FCF_UNRECONCILED_CAP?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  FINANCIAL_DATA_QUALITY_RECONCILIATION_FAILED_CAP?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  FINANCIAL_DATA_QUALITY_BUSINESS_PERSONAL_MIXED_CAP?: number

  @IsOptional()
  @IsNumberString()
  FINANCIAL_SINGLE_SOURCE_DEPENDENCY_THRESHOLD_PERCENT?: string

  @IsOptional()
  @IsNumberString()
  FINANCIAL_OTHER_ACCOUNTS_LIKELY_INCOME_SHARE_PERCENT?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  FINANCIAL_LRT_MIN_OCCURRENCES?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  FINANCIAL_LRT_MIN_TOTAL_RUPEES?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  FINANCIAL_LRT_MIN_AVERAGE_RUPEES?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  FINANCIAL_LRT_HIGH_VOLUME_RUPEES?: number

  @IsOptional()
  @IsNumberString()
  FINANCIAL_BONUS_SALARY_MULTIPLIER?: string

  @IsOptional()
  @IsNumberString()
  FINANCIAL_INCOME_TRANSITION_DELTA_PERCENT?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  FINANCIAL_MEDICAL_SHOCK_THRESHOLD_RUPEES?: number

  @IsOptional()
  @IsNumberString()
  FINANCIAL_MEDICAL_SHOCK_INCOME_SHARE_PERCENT?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  FINANCIAL_CHRONIC_MEDICAL_MIN_MONTHS?: number

  @IsOptional()
  @IsString()
  FINANCIAL_RELATED_PARTY_EMPLOYER_NAMES?: string

  @IsOptional()
  @IsNumberString()
  FINANCIAL_INCOME_DAY_OF_MONTH_MAX_STDDEV_DAYS?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  COHORT_OVERDUE_CAPACITY_TRIGGER_RUPEES?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  COHORT_ENQUIRY_BURST_THRESHOLD_30D?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  COHORT_STACKING_INDEX_PER_YEAR?: number

  @IsOptional()
  @IsNumberString()
  COHORT_ACTIVE_OVERDUE_RATIO_THRESHOLD?: string

  @IsOptional()
  @IsNumberString()
  COHORT_STRESSED_CAPACITY_RATIO_MAX?: string

  @IsOptional()
  @IsNumberString()
  COHORT_TIGHT_CAPACITY_RATIO_MAX?: string

  @IsOptional()
  @IsNumberString()
  COHORT_STABILISATION_COVERAGE_STRONG_MIN?: string

  @IsOptional()
  @IsNumberString()
  COHORT_STABILISATION_COVERAGE_MINIMUM?: string

  @IsOptional()
  @IsString()
  COHORT_RULE_VERSION?: string

  @IsOptional()
  @IsNumberString()
  COHORT_POST_STATEMENT_MINOR_MAX_PERCENT?: string

  @IsOptional()
  @IsNumberString()
  COHORT_POST_STATEMENT_MATERIAL_MAX_PERCENT?: string

  @IsOptional()
  @IsNumberString()
  COHORT_OTHER_ACCOUNTS_MINOR_MAX_PERCENT?: string

  @IsOptional()
  @IsNumberString()
  COHORT_OTHER_ACCOUNTS_FLAG_MAX_PERCENT?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  COHORT_P1_FORCE_BLOCK_THRESHOLD?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  COHORT_EXCEPTION_SPECIALIST_THRESHOLD?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  COHORT_EXCEPTION_MANUAL_REVIEW_THRESHOLD?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  COHORT_COMPLIANCE_SLA_RELATED_PARTY_HOURS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  COHORT_COMPLIANCE_SLA_REGULATORY_HOURS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  COHORT_COMPLIANCE_SLA_LEGAL_HOURS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  COHORT_TTL_CONSENT_PENDING_DAYS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  COHORT_TTL_KYC_PENDING_DAYS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  COHORT_TTL_DATA_REFRESH_REQUIRED_DAYS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  COHORT_TTL_OTHER_ACCOUNTS_REQUIRED_DAYS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  COHORT_TTL_P1_INFORMATION_REQUIRED_DAYS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  COHORT_TTL_MANUAL_REVIEW_REQUIRED_DAYS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  COHORT_TTL_SPECIALIST_REQUIRED_DAYS?: number

  @IsOptional()
  @IsString()
  PLAN_REVIEW_CADENCE_DAYS?: string

  @IsOptional()
  @IsString()
  PLAN_TEMPLATE_REGISTRY_VERSION?: string

  @IsOptional()
  @IsString()
  PATHWAY_RULE_VERSION?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  PATHWAY_TTL_OPTIMISE_DAYS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  PATHWAY_TTL_STABILISE_DAYS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  PATHWAY_TTL_CONSOLIDATE_DAYS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  PATHWAY_TTL_RESTRUCTURE_DAYS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  PATHWAY_TTL_RESOLVE_DAYS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  PATHWAY_TTL_RECOVER_DAYS?: number

  @IsOptional()
  @IsString()
  PLAN_RULE_VERSION?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  PLAN_TTL_OPTIMISE_DAYS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  PLAN_TTL_STABILISE_DAYS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  PLAN_TTL_CONSOLIDATE_DAYS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  PLAN_TTL_RESTRUCTURE_DAYS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  PLAN_TTL_RESOLVE_DAYS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  PLAN_TTL_RECOVER_DAYS?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  PLAN_PLACEHOLDER_TTL_DAYS?: number
}

/**
 * Fails fast at boot if required configuration is missing or malformed,
 * rather than letting a misconfigured server start and fail confusingly
 * on the first request.
 */
export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  })
  const errors = validateSync(validatedConfig, { skipMissingProperties: false })

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.toString()}`)
  }

  return validatedConfig
}
