/**
 * The identity fields a bureau provider may need to fetch a report.
 * `firstName`/`surname`/`mobilePhone` are what the legacy Experian SOAP
 * Applicant block requires (see providers/experian-soap-client.ts). `pan`
 * is additionally required by Signzy's Experian Lite API — nullable
 * because it is never persisted (see PublicContactService.hashPan) and so
 * is genuinely unavailable at reprocess time (the raw PAN only ever exists
 * in-memory, for the one initial trigger call). `consent` is likewise
 * Signzy-specific (its request body requires real consent evidence) and
 * likewise unavailable at reprocess time — reprocessing never calls the
 * provider at all, so this is never read there anyway.
 */
export interface BureauIdentity {
  firstName: string
  surname: string
  mobilePhone: string
  pan?: string | null
  consent?: { grantedAt: Date; granted: boolean; ipAddress: string | null } | null
}

/**
 * Splits a single "full name" field (the only name shape this codebase
 * collects — see public-contact's SubmitLeadDto.name) into the
 * Surname/FirstName pair Experian's Applicant block wants. This is a plain
 * heuristic (last whitespace-separated token = surname, everything before
 * it = first name), not a verified Experian requirement — Indian names
 * don't reliably decompose this way, but no better signal exists upstream.
 * A single-token name uses it as both fields rather than leaving surname
 * empty, since an empty required-looking field is more likely to cause a
 * bureau-side validation error than a repeated name.
 */
export function splitFullName(fullName: string): Pick<BureauIdentity, 'firstName' | 'surname'> {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', surname: '' }
  if (parts.length === 1) return { firstName: parts[0], surname: parts[0] }
  return { firstName: parts.slice(0, -1).join(' '), surname: parts[parts.length - 1] }
}

/**
 * Strips a stored phone value (e.g. "+91 9000010001", however it was
 * formatted when saved — see Lead.phone) down to a bare 10-digit mobile
 * number, since Experian's `MobilePhone` field is a plain national number,
 * not an internationally-prefixed one.
 */
export function toBareMobile(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.slice(-10)
}
