import { Global, Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { S3Service } from './s3.service';
import { VirusScanService } from './virus-scan.service';

/** Global so any module can inject PdfService / S3Service / VirusScanService without importing this module. */
@Global()
@Module({
  providers: [PdfService, S3Service, VirusScanService],
  exports: [PdfService, S3Service, VirusScanService],
})
export class CommonModule {}
