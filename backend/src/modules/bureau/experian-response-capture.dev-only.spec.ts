import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { callExperianProcess } from './providers/experian-soap-client'

/**
 * NOT a real automated test — it makes ZERO assertions about the response
 * shape, because this codebase has never been given a verified sample of
 * one (see ExperianCreditReportProvider's doc comment). Its only job is to
 * capture one real (or sandbox) Experian response to a local, gitignored
 * file so a developer can inspect it and complete the response-field
 * mapping this integration currently stops short of (see
 * CreditReportUnmappedResponseError).
 *
 * Always skipped unless BOTH `CREDIT_REPORT_PROVIDER=experian` AND real
 * `EXPERIAN_XML_USER`/`EXPERIAN_XML_PASSWORD` are set in the environment —
 * never runs in CI, never runs in a normal `npm test`, and never sends a
 * request with placeholder/empty credentials.
 */
const hasRealCredentials =
  process.env.CREDIT_REPORT_PROVIDER === 'experian' &&
  Boolean(process.env.EXPERIAN_XML_USER) &&
  Boolean(process.env.EXPERIAN_XML_PASSWORD)

const describeIfConfigured = hasRealCredentials ? describe : describe.skip

describeIfConfigured('Experian response capture (dev-only, opt-in)', () => {
  it('captures one real response to tmp/experian-response-capture/ for manual inspection', async () => {
    const payload = await callExperianProcess(
      {
        // A clearly-fake test identity — never a real customer's data.
        firstName: 'Test',
        surname: 'Capture',
        mobilePhone: '9000000000',
      },
      {
        soapEndpoint: process.env.EXPERIAN_SOAP_ENDPOINT ?? 'https://connect.experian.in:8443/ngwsconnect/ngws',
        soapNamespace: process.env.EXPERIAN_SOAP_NAMESPACE ?? 'http://nextgenws.ngwsconnect.experian.com',
        xmlUser: process.env.EXPERIAN_XML_USER!,
        xmlPassword: process.env.EXPERIAN_XML_PASSWORD!,
        requestTimeoutMs: 30_000,
      },
    )

    const outDir = join(__dirname, '..', '..', '..', 'tmp', 'experian-response-capture')
    mkdirSync(outDir, { recursive: true })
    const outFile = join(outDir, `response-${Date.now()}.xml`)
    writeFileSync(outFile, payload, 'utf-8')

    console.log(`Captured a real Experian response payload to: ${outFile}`)
  }, 30_000)
})
