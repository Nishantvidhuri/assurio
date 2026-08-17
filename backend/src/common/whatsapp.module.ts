import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';

/**
 * OpenWA (self-hosted WhatsApp) integration. Global so any module can inject
 * WhatsAppService without importing this one. AuthModule supplies JwtAuthGuard
 * for the controller. PdfService/S3Service come from the global CommonModule.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
