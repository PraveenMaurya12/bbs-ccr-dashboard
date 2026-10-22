import { IsEnum } from 'class-validator'

/** Mirrors BbsPlanActionStatus exactly — kept as its own DTO-local list, same reasoning as OverridePlanDto's own OverridePlanLifecycleValue. */
export enum UpdateActionStatusValue {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETE = 'COMPLETE',
  BLOCKED = 'BLOCKED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  ESCALATED = 'ESCALATED',
}

export class UpdateActionStatusDto {
  @IsEnum(UpdateActionStatusValue)
  status!: UpdateActionStatusValue
}
