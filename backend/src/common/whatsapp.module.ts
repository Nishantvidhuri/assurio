import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { PdfService } from './pdf.service';
import { S3Service } from './s3.service';

/** Global so any module can inject WhatsAppService / PdfService / S3Service without importing this module. */
@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, PdfService, S3Service],
  exports: [WhatsAppService, PdfService, S3Service],
})
export class WhatsAppModule {}
