import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator'

/** Mirrors CohortPrimaryState exactly — kept as its own DTO-local list (not importing the Prisma enum) so an invalid value is rejected at the HTTP boundary with a clear validation message, not a raw Prisma error. */
export enum OverrideCohortValue {
  CONSENT_PENDING = 'CONSENT_PENDING',
  KYC_PENDING = 'KYC_PENDING',
  X1 = 'X1',
  C6 = 'C6',
  C5 = 'C5',
  C4 = 'C4',
  C3 = 'C3',
  C2 = 'C2',
  C1 = 'C1',
  C7 = 'C7',
  X2 = 'X2',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
  CUSTOMER_UNRESPONSIVE = 'CUSTOMER_UNRESPONSIVE',
  COMPLIANCE_HOLD = 'COMPLIANCE_HOLD',
  DATA_REFRESH_REQUIRED = 'DATA_REFRESH_REQUIRED',
  OTHER_ACCOUNTS_REQUIRED = 'OTHER_ACCOUNTS_REQUIRED',
  P1_INFORMATION_REQUIRED = 'P1_INFORMATION_REQUIRED',
  SPECIALIST_REQUIRED = 'SPECIALIST_REQUIRED',
  CCR_REQUIRED = 'CCR_REQUIRED',
}

export class OverrideCohortDto {
  @IsEnum(OverrideCohortValue)
  newPrimaryCohort!: OverrideCohortValue

  @IsString()
  @MinLength(10)
  reason!: string

  /** v3.0 §19.2: required only when `newPrimaryCohort` is C1, C4, or C6 (maker-checker) — enforced in CohortEngineService.override(), not here, since the condition depends on the cohort value. */
  @IsOptional()
  @IsString()
  approverId?: string
}
