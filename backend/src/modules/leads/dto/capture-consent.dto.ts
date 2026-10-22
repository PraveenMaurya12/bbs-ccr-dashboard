import { Equals, IsString, Matches } from 'class-validator'

/**
 * CCR-attested consent + PAN capture for a lead created via the internal
 * "Create Lead" form. Without this, a CCR-created lead has no path to a
 * bureau pull at all: `CreateLeadDto` never collects a PAN, and
 * `BureauReportService.triggerForLead()` is otherwise only ever called
 * from the public self-service contact-form flow (`PublicContactService`)
 * — confirmed via a repo-wide grep showing zero other callers. The raw
 * PAN here is used only to hash it (`Lead.panRef`) and to build the one
 * in-memory `BureauIdentity` passed to `triggerForLead()`; it is never
 * persisted (same discipline as `PublicContactService.hashPan`).
 */
export class CaptureConsentDto {
  @IsString()
  @Matches(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/, { message: 'Enter a valid PAN' })
  pan!: string

  @Equals(true, { message: 'Consent must be explicitly granted before a bureau report can be pulled' })
  consentGranted!: boolean
}
