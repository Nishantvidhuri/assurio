import { Global, Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { S3Service } from './s3.service';

/** Global so any module can inject PdfService / S3Service without importing this module. */
@Global()
@Module({
  providers: [PdfService, S3Service],
  exports: [PdfService, S3Service],
})
export class CommonModule {}
