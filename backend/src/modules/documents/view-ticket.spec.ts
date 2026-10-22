import { issueViewTicket, verifyViewTicket } from './view-ticket'

const SECRET = 'test-secret'

describe('view-ticket', () => {
  it('accepts a freshly issued ticket for the same document', () => {
    const ticket = issueViewTicket({ documentId: 'doc-1', userId: 'user-1' }, SECRET)
    expect(verifyViewTicket(ticket, 'doc-1', SECRET)).toEqual({ documentId: 'doc-1', userId: 'user-1' })
  })

  it('rejects a ticket presented for a different document id', () => {
    const ticket = issueViewTicket({ documentId: 'doc-1', userId: 'user-1' }, SECRET)
    expect(verifyViewTicket(ticket, 'doc-2', SECRET)).toBeNull()
  })

  it('rejects a ticket signed with a different secret', () => {
    const ticket = issueViewTicket({ documentId: 'doc-1', userId: 'user-1' }, SECRET)
    expect(verifyViewTicket(ticket, 'doc-1', 'wrong-secret')).toBeNull()
  })

  it('rejects a tampered/garbage ticket string', () => {
    expect(verifyViewTicket('not-a-real-ticket', 'doc-1', SECRET)).toBeNull()
  })

  it('rejects an expired ticket', () => {
    const originalNow = Date.now
    Date.now = () => originalNow() - 10 * 60 * 1000 // 10 minutes in the past — well past the 2-minute TTL
    const ticket = issueViewTicket({ documentId: 'doc-1', userId: 'user-1' }, SECRET)
    Date.now = originalNow

    expect(verifyViewTicket(ticket, 'doc-1', SECRET)).toBeNull()
  })
})
