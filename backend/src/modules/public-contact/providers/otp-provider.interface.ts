export type OtpErrorCode = 'invalid_code' | 'expired_code' | 'generic_error'

export interface OtpResult {
  success: boolean
  errorCode?: OtpErrorCode
}

/**
 * Provider-independent contract for sending/verifying an OTP. Swapping the
 * binding in PublicContactModule for a real SMS provider (MSG91, Twilio,
 * ...) is the only change needed to go from dev-mock to production —
 * nothing in PublicContactService, the controller, or the DTOs changes.
 */
export interface OtpProvider {
  readonly providerName: string
  sendOtp(mobile: string): Promise<OtpResult>
  verifyOtp(mobile: string, code: string): Promise<OtpResult>
}

export const OTP_PROVIDER = Symbol('OTP_PROVIDER')
