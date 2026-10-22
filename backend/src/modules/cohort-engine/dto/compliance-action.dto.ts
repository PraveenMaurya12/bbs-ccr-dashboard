import { IsString, MinLength } from 'class-validator'

/** v3.0 §7.4: both compliance clear/decline actions require a real, non-trivial reason — auditability (§19.1) never accepts a blank or placeholder reason. */
export class ComplianceActionDto {
  @IsString()
  @MinLength(10)
  reason!: string
}
