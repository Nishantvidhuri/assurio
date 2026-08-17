import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { UsersService } from '../users/users.service';
import {
  INVOICE_PDF_QUEUE,
  InvoicePdfService,
} from './invoice-pdf.service';
import { InvoicePdfProcessor } from './invoice-pdf.processor';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      signOptions: { expiresIn: '7d' },
    }),
    // Invoice PDFs are rendered off the request path and stored on S3.
    BullModule.registerQueue({ name: INVOICE_PDF_QUEUE }),
    BullBoardModule.forFeature({
      name: INVOICE_PDF_QUEUE,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    UsersService,
    InvoicePdfService,
    InvoicePdfProcessor,
  ],
  exports: [PaymentsService, InvoicePdfService],
})
export class PaymentsModule {}
