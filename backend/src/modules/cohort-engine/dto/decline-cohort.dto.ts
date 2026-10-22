import { IsOptional, IsString } from 'class-validator'

/** v3.0 §14.3: the explicit customer-decline path. `reason` is optional — a customer is never required to explain a decline. */
export class DeclineCohortDto {
  @IsOptional()
  @IsString()
  reason?: string
}
