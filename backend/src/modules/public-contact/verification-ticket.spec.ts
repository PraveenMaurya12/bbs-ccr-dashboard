import { issueVerificationTicket, verifyTicket } from './verification-ticket'

const SECRET = 'test-secret'

describe('verification-ticket', () => {
  it('accepts a freshly issued ticket for the same mobile number', () => {
    const ticket = issueVerificationTicket('9876543210', SECRET)
    expect(verifyTicket(ticket, '9876543210', SECRET)).toBe(true)
  })

  it('rejects a ticket presented for a different mobile number', () => {
    const ticket = issueVerificationTicket('9876543210', SECRET)
    expect(verifyTicket(ticket, '9111111111', SECRET)).toBe(false)
  })

  it('rejects a ticket signed with a different secret', () => {
    const ticket = issueVerificationTicket('9876543210', SECRET)
    expect(verifyTicket(ticket, '9876543210', 'wrong-secret')).toBe(false)
  })

  it('rejects a tampered/garbage ticket string', () => {
    expect(verifyTicket('not-a-real-ticket', '9876543210', SECRET)).toBe(false)
  })

  it('rejects an expired ticket', () => {
    const originalNow = Date.now
    Date.now = () => originalNow() - 20 * 60 * 1000 // 20 minutes in the past
    const ticket = issueVerificationTicket('9876543210', SECRET)
    Date.now = originalNow

    expect(verifyTicket(ticket, '9876543210', SECRET)).toBe(false)
  })
})
