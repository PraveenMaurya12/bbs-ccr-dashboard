import { parseCsvStatement } from './csv-statement-parser'
import { StatementParseError } from './types'

describe('parseCsvStatement', () => {
  it('parses a realistic CSV export with a metadata preamble before the real header row', async () => {
    const csv = [
      'Account Statement',
      'Period: 01-Apr-2026 to 30-Apr-2026',
      '',
      'Date,Narration,Debit,Credit,Balance',
      '01/04/2026,SALARY CREDIT ABC CORP,,50000.00,50000.00',
      '02/04/2026,ATM WD,2000.00,,48000.00',
    ].join('\n')

    const result = await parseCsvStatement(Buffer.from(csv))

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({ rawDate: '01/04/2026', narration: 'SALARY CREDIT ABC CORP', rawCredit: '50000.00', rawBalance: '50000.00' })
    expect(result.rows[1]).toMatchObject({ rawDate: '02/04/2026', narration: 'ATM WD', rawDebit: '2000.00', rawBalance: '48000.00' })
  })

  it('parses a single signed-amount-column layout', async () => {
    const csv = ['Txn Date,Description,Amount,Running Balance', '01/04/2026,SALARY,50000.00,50000.00', '02/04/2026,ATM WD,-2000.00,48000.00'].join('\n')
    const result = await parseCsvStatement(Buffer.from(csv))
    expect(result.rows).toHaveLength(2)
    expect(result.rows[1].rawAmount).toBe('-2000.00')
  })

  it('skips a trailing all-blank footer row rather than fabricating a transaction', async () => {
    const csv = ['Date,Narration,Debit,Credit,Balance', '01/04/2026,SALARY,,50000.00,50000.00', ',,,,'].join('\n')
    const result = await parseCsvStatement(Buffer.from(csv))
    expect(result.rows).toHaveLength(1)
  })

  it('throws CORRUPT_FILE for a file with no rows at all', async () => {
    await expect(parseCsvStatement(Buffer.from(''))).rejects.toMatchObject({ code: 'CORRUPT_FILE' })
    await expect(parseCsvStatement(Buffer.from(''))).rejects.toBeInstanceOf(StatementParseError)
  })

  it('reports no recognizable header via a warning rather than throwing when the file has rows but no header', async () => {
    const result = await parseCsvStatement(Buffer.from('just,some,random,text\nwithout,a,real,header'))
    expect(result.rows).toEqual([])
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})
