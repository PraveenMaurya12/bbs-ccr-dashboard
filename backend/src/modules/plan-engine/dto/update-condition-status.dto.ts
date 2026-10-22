import { IsEnum, IsOptional, IsString } from 'class-validator'

export enum UpdateConditionStateValue {
  MET = 'MET',
  PENDING = 'PENDING',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
}

export class UpdateConditionStatusDto {
  @IsEnum(UpdateConditionStateValue)
  state!: UpdateConditionStateValue

  @IsOptional()
  @IsString()
  verificationEvidence?: string
}
