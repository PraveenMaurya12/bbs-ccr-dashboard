import { splitFullName, toBareMobile } from './identity'

describe('splitFullName', () => {
  it('splits a two-part name into firstName + surname', () => {
    expect(splitFullName('Ananya Rao')).toEqual({ firstName: 'Ananya', surname: 'Rao' })
  })

  it('treats every word before the last as the first name', () => {
    expect(splitFullName('Bharat Kumar Mishra')).toEqual({ firstName: 'Bharat Kumar', surname: 'Mishra' })
  })

  it('uses a single-token name for both fields rather than leaving surname empty', () => {
    expect(splitFullName('Cher')).toEqual({ firstName: 'Cher', surname: 'Cher' })
  })

  it('collapses extra whitespace', () => {
    expect(splitFullName('  Ananya   Rao  ')).toEqual({ firstName: 'Ananya', surname: 'Rao' })
  })
})

describe('toBareMobile', () => {
  it('strips a "+91 " prefix and any spaces', () => {
    expect(toBareMobile('+91 9000010001')).toBe('9000010001')
  })

  it('is a no-op for an already-bare 10-digit number', () => {
    expect(toBareMobile('9000010001')).toBe('9000010001')
  })

  it('keeps only the last 10 digits for any other punctuation/prefix shape', () => {
    expect(toBareMobile('+91-90000-10001')).toBe('9000010001')
  })
})
