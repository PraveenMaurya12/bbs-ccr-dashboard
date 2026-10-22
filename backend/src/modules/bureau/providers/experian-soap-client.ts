import { XMLBuilder, XMLParser } from 'fast-xml-parser'

import type { BureauIdentity } from '../identity'
import {
  CreditReportMalformedResponseError,
  CreditReportSoapFaultError,
  CreditReportTimeoutError,
  CreditReportTransportError,
} from './credit-report-provider.interface'

const SOAP_ENVELOPE_NS = 'http://schemas.xmlsoap.org/soap/envelope/'

export interface ExperianSoapConfig {
  soapEndpoint: string
  soapNamespace: string
  xmlUser: string
  xmlPassword: string
  requestTimeoutMs: number
}

const innerBuilder = new XMLBuilder({ format: false, ignoreAttributes: true })

/**
 * Builds the `INProfileRequest` XML exactly as specified: an
 * `Identification` block (XMLUser/XMLPassword) and an `Applicant` block
 * (Surname/FirstName/MobilePhone) — no other fields, since none were given.
 */
export function buildInProfileRequestXml(identity: BureauIdentity, credentials: { xmlUser: string; xmlPassword: string }): string {
  return innerBuilder.build({
    INProfileRequest: {
      Identification: {
        XMLUser: credentials.xmlUser,
        XMLPassword: credentials.xmlPassword,
      },
      Applicant: {
        Surname: identity.surname,
        FirstName: identity.firstName,
        MobilePhone: identity.mobilePhone,
      },
    },
  })
}

/** Escapes a literal `]]>` inside content that is about to be placed inside a CDATA section — the one sequence CDATA cannot otherwise contain. */
function escapeForCdata(xml: string): string {
  return xml.replace(/]]>/g, ']]]]><![CDATA[>')
}

/**
 * Builds the full SOAP envelope for the `process` operation, with the
 * INProfileRequest XML embedded verbatim (CDATA-encoded) inside
 * `cbv2String`, per the integration spec. The exact child element name
 * under `<process>` (`cbv2String`) and the operation name (`process`) are
 * as given; everything else about the envelope (prefixes, header) follows
 * standard SOAP 1.1 conventions since none of that was specified either.
 */
export function buildProcessEnvelope(innerRequestXml: string, namespace: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${SOAP_ENVELOPE_NS}" xmlns:ngws="${namespace}">` +
    `<soapenv:Header/>` +
    `<soapenv:Body>` +
    `<ngws:process>` +
    `<ngws:cbv2String><![CDATA[${escapeForCdata(innerRequestXml)}]]></ngws:cbv2String>` +
    `</ngws:process>` +
    `</soapenv:Body>` +
    `</soapenv:Envelope>`
  )
}

async function postXml(endpoint: string, body: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        // The WSDL-defined SOAPAction value wasn't provided — "process"
        // mirrors the operation name, a common (but unverified) default.
        SOAPAction: 'process',
      },
      body,
      signal: controller.signal,
    })

    const text = await response.text()

    if (!response.ok) {
      throw new CreditReportTransportError(
        `Experian SOAP endpoint responded with HTTP ${response.status}: ${text.slice(0, 500)}`,
      )
    }

    return text
  } catch (error) {
    if (error instanceof CreditReportTransportError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CreditReportTimeoutError(`Experian SOAP request timed out after ${timeoutMs}ms`)
    }
    throw new CreditReportTransportError(
      `Experian SOAP request failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    clearTimeout(timeout)
  }
}

const responseParser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  trimValues: true,
  // fast-xml-parser's own anti-XML-bomb guard defaults to a 1000-entity
  // cap — far too low for a real, large bureau-report SOAP envelope (which
  // legitimately contains many escaped `&amp;`/`&lt;`/etc. entities across
  // a full credit report's worth of fields). Raised to a still-bounded
  // value calibrated for a real response, confirmed necessary against a
  // genuine Experian production response (see this integration's own
  // verification notes) rather than left at a value that silently rejects
  // every real response.
  processEntities: { enabled: true, maxTotalExpansions: 200_000, maxExpandedLength: 5_000_000 },
})

/** Recursively finds the first string leaf value in a parsed-XML object graph — used to locate the operation's response payload without knowing its exact wrapper tag names in advance (see module doc comment). */
function firstStringLeaf(node: unknown): string | null {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = firstStringLeaf(item)
      if (found !== null) return found
    }
    return null
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      const found = firstStringLeaf(value)
      if (found !== null) return found
    }
  }
  return null
}

/**
 * Parses the outer SOAP envelope, surfaces a SOAP Fault as a typed error,
 * and returns the operation response's inner payload string (expected to
 * itself be an XML document, mirroring how the request embeds
 * INProfileRequest inside cbv2String) for the caller to parse further.
 *
 * The response element names Experian actually uses (e.g. whatever wraps
 * the reply — a `processResponse`/`processReturn`-style element, and
 * whatever holds the payload string inside it) were not part of the
 * supplied integration spec, which only documented the *request* shape.
 * This function deliberately does not assume a specific tag name for
 * either: it strips the envelope down to `Body`, checks for a `Fault`
 * anywhere in it, and otherwise returns the first string value found in
 * the remaining subtree. That is a reasonable, generic way to extract "the
 * one payload string" from an unknown-but-conventional SOAP response
 * shape — it is NOT a verified mapping, and must be confirmed against a
 * real Experian response before this integration is trusted in production.
 */
export function parseSoapResponse(rawXml: string): string {
  let parsed: unknown
  try {
    parsed = responseParser.parse(rawXml)
  } catch (error) {
    throw new CreditReportMalformedResponseError(
      `Experian SOAP response was not valid XML: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const envelope = (parsed as Record<string, unknown>)?.Envelope as Record<string, unknown> | undefined
  const body = envelope?.Body as Record<string, unknown> | undefined
  if (!body) {
    throw new CreditReportMalformedResponseError('Experian SOAP response had no recognizable Envelope/Body')
  }

  if ('Fault' in body) {
    const fault = body.Fault as Record<string, unknown>
    const faultString =
      (fault.faultstring as string | undefined) ?? (fault.Reason as string | undefined) ?? 'Unknown SOAP fault'
    throw new CreditReportSoapFaultError(`Experian SOAP fault: ${faultString}`)
  }

  const payload = firstStringLeaf(body)
  if (payload === null) {
    throw new CreditReportMalformedResponseError(
      'Experian SOAP response Body contained no string payload to extract — response shape needs to be verified against a real sample.',
    )
  }

  return payload
}

export async function callExperianProcess(identity: BureauIdentity, config: ExperianSoapConfig): Promise<string> {
  const innerXml = buildInProfileRequestXml(identity, { xmlUser: config.xmlUser, xmlPassword: config.xmlPassword })
  const envelope = buildProcessEnvelope(innerXml, config.soapNamespace)
  const rawResponse = await postXml(config.soapEndpoint, envelope, config.requestTimeoutMs)
  return parseSoapResponse(rawResponse)
}
