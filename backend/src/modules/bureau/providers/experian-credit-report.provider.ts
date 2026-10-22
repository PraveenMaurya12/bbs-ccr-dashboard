import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { AppConfig } from '@/config/configuration'
import type { BureauIdentity } from '../identity'
import { mapInProfileResponseXml } from './experian-response.mapper'
import { CreditReportUnmappedResponseError, type CreditReportProvider, type FetchReportResult } from './credit-report-provider.interface'
import { callExperianProcess, type ExperianSoapConfig } from './experian-soap-client'

/**
 * Real Experian SOAP integration. The SOAP transport (envelope shape,
 * `process` operation, `cbv2String` CDATA request, SOAP-fault detection,
 * timeout/transport-error handling — see experian-soap-client.ts) is fully
 * implemented against the integration spec this codebase was actually
 * given, and has been exercised against the real production endpoint
 * (see experian-response.mapper.ts's doc comment and its captured fixture).
 *
 * RESPONSE FIELD MAPPING is delegated to experian-response.mapper.ts,
 * which maps exactly one verified real response shape ("no bureau record
 * found for this identity") and throws `CreditReportUnmappedResponseError`
 * for anything else — most importantly a real "record found" response
 * with tradelines/enquiries, whose structure has never been captured. See
 * that file's own doc comment for exactly what's needed to complete that
 * mapping once a real matched-identity sample is available.
 */
@Injectable()
export class ExperianCreditReportProvider implements CreditReportProvider {
  readonly providerName = 'experian'

  constructor(private readonly configService: ConfigService) {}

  private get soapConfig(): ExperianSoapConfig {
    const config = this.configService.get<AppConfig>('app')!.bureau.experian
    return config
  }

  async fetchReport(identity: BureauIdentity): Promise<FetchReportResult> {
    const innerPayload = await callExperianProcess(identity, this.soapConfig)
    try {
      const data = mapInProfileResponseXml(innerPayload, identity)
      return { data, rawResponse: innerPayload }
    } catch (error) {
      // A real response WAS received (this is not a transport failure) —
      // attach it so BureauReportService can persist it for later
      // reprocessing without ever calling Experian again for this lead.
      if (error instanceof CreditReportUnmappedResponseError) {
        error.rawResponse = innerPayload
      }
      throw error
    }
  }
}
