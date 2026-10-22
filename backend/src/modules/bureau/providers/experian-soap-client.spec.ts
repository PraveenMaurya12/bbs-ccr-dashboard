import { CreditReportMalformedResponseError, CreditReportSoapFaultError } from './credit-report-provider.interface'
import { buildInProfileRequestXml, buildProcessEnvelope, parseSoapResponse } from './experian-soap-client'

describe('buildInProfileRequestXml', () => {
  it('includes exactly the given Identification and Applicant fields, nothing invented', () => {
    const xml = buildInProfileRequestXml(
      { firstName: 'Ananya', surname: 'Rao', mobilePhone: '9000010001' },
      { xmlUser: 'user1', xmlPassword: 'pass1' },
    )
    expect(xml).toContain('<INProfileRequest>')
    expect(xml).toContain('<Identification>')
    expect(xml).toContain('<XMLUser>user1</XMLUser>')
    expect(xml).toContain('<XMLPassword>pass1</XMLPassword>')
    expect(xml).toContain('<Applicant>')
    expect(xml).toContain('<Surname>Rao</Surname>')
    expect(xml).toContain('<FirstName>Ananya</FirstName>')
    expect(xml).toContain('<MobilePhone>9000010001</MobilePhone>')
  })

  it('XML-escapes a value containing a special character rather than breaking the document', () => {
    const xml = buildInProfileRequestXml(
      { firstName: 'A&B', surname: 'Rao', mobilePhone: '9000010001' },
      { xmlUser: 'user1', xmlPassword: 'pass1' },
    )
    expect(xml).toContain('A&amp;B')
    expect(xml).not.toContain('A&B<')
  })
})

describe('buildProcessEnvelope', () => {
  it('wraps the inner request in a CDATA section inside ngws:cbv2String under ngws:process', () => {
    const envelope = buildProcessEnvelope('<INProfileRequest></INProfileRequest>', 'http://nextgenws.ngwsconnect.experian.com')
    expect(envelope).toContain('xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"')
    expect(envelope).toContain('xmlns:ngws="http://nextgenws.ngwsconnect.experian.com"')
    expect(envelope).toContain('<ngws:process>')
    expect(envelope).toContain('<ngws:cbv2String><![CDATA[<INProfileRequest></INProfileRequest>]]></ngws:cbv2String>')
  })

  it('escapes a literal "]]>" inside the embedded XML so the CDATA section stays well-formed', () => {
    const envelope = buildProcessEnvelope('before]]>after', 'ns')
    expect(envelope).not.toContain('before]]>after')
    expect(envelope).toContain('before]]]]><![CDATA[>after')
  })
})

describe('parseSoapResponse', () => {
  it('throws CreditReportMalformedResponseError for non-XML input', () => {
    expect(() => parseSoapResponse('not xml at all {{{')).toThrow(CreditReportMalformedResponseError)
  })

  it('throws CreditReportMalformedResponseError when there is no Envelope/Body', () => {
    expect(() => parseSoapResponse('<somethingElse></somethingElse>')).toThrow(CreditReportMalformedResponseError)
  })

  it('detects a SOAP fault and surfaces its faultstring', () => {
    const soapFault =
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">' +
      '<soapenv:Body><soapenv:Fault><faultcode>soapenv:Server</faultcode>' +
      '<faultstring>Authentication failed</faultstring></soapenv:Fault></soapenv:Body>' +
      '</soapenv:Envelope>'

    expect(() => parseSoapResponse(soapFault)).toThrow(CreditReportSoapFaultError)
    expect(() => parseSoapResponse(soapFault)).toThrow(/Authentication failed/)
  })

  it('extracts the payload string from a conventional processResponse wrapper', () => {
    const response =
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ngws="http://nextgenws.ngwsconnect.experian.com">' +
      '<soapenv:Body><ngws:processResponse><ngws:processReturn>' +
      '<![CDATA[<INProfileResponse><Score>750</Score></INProfileResponse>]]>' +
      '</ngws:processReturn></ngws:processResponse></soapenv:Body></soapenv:Envelope>'

    const payload = parseSoapResponse(response)
    expect(payload).toContain('<INProfileResponse>')
    expect(payload).toContain('750')
  })

  it('throws CreditReportMalformedResponseError when Body has no extractable string payload', () => {
    const empty =
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">' +
      '<soapenv:Body></soapenv:Body></soapenv:Envelope>'
    expect(() => parseSoapResponse(empty)).toThrow(CreditReportMalformedResponseError)
  })
})
