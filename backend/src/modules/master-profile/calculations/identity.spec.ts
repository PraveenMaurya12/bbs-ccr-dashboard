import { reconcileIdentity } from './identity'
import type { CustomerIdentityFact, LeadIdentityFact } from '../master-profile.types'

function lead(overrides: Partial<LeadIdentityFact> = {}): LeadIdentityFact {
  return { fullName: 'Ravi Kumar', phone: '9876543210', email: 'ravi@example.com', city: 'Pune', panAvailable: true, panRef: 'hash-abc', ...overrides }
}

function customer(overrides: Partial<CustomerIdentityFact> = {}): CustomerIdentityFact {
  return {
    fullName: 'Ravi Kumar',
    phone: '9876543210',
    email: 'ravi@example.com',
    city: 'Pune',
    dateOfBirth: new Date('1990-05-01'),
    gender: 'Male',
    occupation: 'Salaried',
    employmentType: 'Full-time',
    companyName: 'Acme Corp',
    designation: 'Manager',
    monthlySalary: 50000,
    panAvailable: true,
    panRef: 'hash-abc',
    ...overrides,
  }
}

describe('reconcileIdentity', () => {
  it('reports HIGH confidence, no conflict, when both sources agree', () => {
    const result = reconcileIdentity(lead(), customer())
    const fullName = result.fields.find((f) => f.field === 'fullName')!
    expect(fullName.confidence).toBe('HIGH')
    expect(fullName.conflict).toBe(false)
    expect(result.hasConflict).toBe(false)
  })

  it('CRITICAL: preserves BOTH conflicting values rather than silently overwriting', () => {
    const result = reconcileIdentity(lead({ city: 'Mumbai' }), customer({ city: 'Pune' }))
    const city = result.fields.find((f) => f.field === 'city')!
    expect(city.conflict).toBe(true)
    expect(city.sourceValues).toEqual(
      expect.arrayContaining([
        { value: 'Mumbai', source: 'LEAD_FORM' },
        { value: 'Pune', source: 'CCR_VERIFIED' },
      ]),
    )
    expect(result.hasConflict).toBe(true)
  })

  it('uses the Lead value with HIGH confidence when no Customer row exists yet', () => {
    const result = reconcileIdentity(lead(), null)
    const fullName = result.fields.find((f) => f.field === 'fullName')!
    expect(fullName.canonicalValue).toBe('Ravi Kumar')
    expect(fullName.sourceValues).toEqual([{ value: 'Ravi Kumar', source: 'LEAD_FORM' }])
    expect(fullName.confidence).toBe('HIGH')
  })

  it('reports an unavailable field as null/LOW confidence rather than an empty string', () => {
    const result = reconcileIdentity(lead({ email: null }), null)
    const email = result.fields.find((f) => f.field === 'email')!
    expect(email.canonicalValue).toBeNull()
    expect(email.confidence).toBe('LOW')
  })

  it('includes Customer-only fields (DOB/gender/employment) with no conflict possible', () => {
    const result = reconcileIdentity(lead(), customer())
    const dob = result.fields.find((f) => f.field === 'dateOfBirth')!
    expect(dob.canonicalValue).toBe('1990-05-01')
    expect(dob.confidence).toBe('HIGH')
  })

  it('never exposes a raw PAN value — only an availability flag', () => {
    const result = reconcileIdentity(lead({ panAvailable: true }), customer({ panAvailable: false, panRef: null }))
    expect(result.panAvailable).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/[A-Z]{5}[0-9]{4}[A-Z]/) // PAN's own format, never present
  })

  describe('panRefConflict (v3.0 §3.3 G6)', () => {
    it('flags a conflict when Lead and Customer panRef hashes differ — never comparing the raw PAN itself', () => {
      const result = reconcileIdentity(lead({ panRef: 'hash-lead-pan' }), customer({ panRef: 'hash-different-pan' }))
      expect(result.panRefConflict).toBe(true)
      expect(result.hasConflict).toBe(true)
    })

    it('does NOT flag a conflict when the hashes match', () => {
      const result = reconcileIdentity(lead({ panRef: 'hash-same' }), customer({ panRef: 'hash-same' }))
      expect(result.panRefConflict).toBe(false)
    })

    it('does NOT flag a conflict when only one side has a PAN on file — that is partial availability, not a mismatch', () => {
      const result = reconcileIdentity(lead({ panRef: 'hash-abc' }), customer({ panRef: null }))
      expect(result.panRefConflict).toBe(false)
      const result2 = reconcileIdentity(lead({ panRef: null }), null)
      expect(result2.panRefConflict).toBe(false)
    })
  })
})
