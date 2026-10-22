import { IsEnum, IsString, MinLength } from 'class-validator'

/** Mirrors BbsPlanLifecycleStatus exactly — kept as its own DTO-local list (not importing the Prisma enum) so an invalid value is rejected at the HTTP boundary with a clear validation message, not a raw Prisma error. */
export enum OverridePlanLifecycleValue {
  DRAFT = 'DRAFT',
  CCR_REVIEW = 'CCR_REVIEW',
  SPECIALIST_REVIEW = 'SPECIALIST_REVIEW',
  CUSTOMER_ACCEPTANCE_PENDING = 'CUSTOMER_ACCEPTANCE_PENDING',
  EXECUTION_READY = 'EXECUTION_READY',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  REASSESSMENT_REQUIRED = 'REASSESSMENT_REQUIRED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class OverridePlanDto {
  @IsEnum(OverridePlanLifecycleValue)
  newLifecycleStatus!: OverridePlanLifecycleValue

  @IsString()
  @MinLength(10)
  reason!: string
}
