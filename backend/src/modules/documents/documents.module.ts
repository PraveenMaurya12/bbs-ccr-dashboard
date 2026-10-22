import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MulterModule } from '@nestjs/platform-express'

import type { AppConfig } from '@/config/configuration'
import { FinancialAnalysisModule } from '@/modules/financial-analysis/financial-analysis.module'
import { DocumentsController } from './documents.controller'
import { DocumentsService } from './documents.service'
import { DOCUMENT_STORAGE_PROVIDER } from './storage/document-storage.interface'
import { LocalDiskStorageProvider } from './storage/local-disk-storage.provider'

@Module({
  imports: [
    // Only the size limit is enforced here — file-type is validated
    // explicitly in DocumentsController.upload instead of via multer's
    // fileFilter, which drops a rejected file silently (req.file just ends
    // up undefined, indistinguishable from "no file was sent at all").
    // Checking the real, always-present mimetype in the controller gives a
    // genuinely accurate error message either way.
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        limits: { fileSize: configService.get<AppConfig>('app')!.documents.maxFileSizeBytes },
      }),
    }),
    // One-directional: DocumentsModule depends on FinancialAnalysisModule
    // (to trigger/reprocess bank-statement analysis after an upload),
    // never the other way — same precedent as BureauModule -> AnalysisModule.
    FinancialAnalysisModule,
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    {
      provide: DOCUMENT_STORAGE_PROVIDER,
      useFactory: (configService: ConfigService) => {
        const providerName = configService.get<AppConfig>('app')!.documents.storageProvider
        if (providerName === 'local') {
          return new LocalDiskStorageProvider(configService)
        }
        throw new Error(
          `Unknown DOCUMENT_STORAGE_PROVIDER "${providerName}" — only "local" is implemented. ` +
            'Implement DocumentStorageProvider for a real bucket provider before configuring anything else.',
        )
      },
      inject: [ConfigService],
    },
  ],
})
export class DocumentsModule {}
