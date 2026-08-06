import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { AuthModule } from './auth/auth.module';
import { VerifyModule } from './verify/verify.module';
import { SubjectsModule } from './subjects/subjects.module';
import { PackagesModule } from './packages/packages.module';
import { AdminModule } from './admin/admin.module';
import { PaymentsModule } from './payments/payments.module';
import { BulkModule } from './bulk/bulk.module';
import { OutboxModule } from './outbox/outbox.module';
import { BullBoardAuthMiddleware } from './common/bull-board-auth.middleware';
import { PrismaModule } from './common/prisma.module';
import { CommonModule } from './common/common.module';
import { EventsModule } from './common/events.module';
import { DraftModule } from './draft/draft.module';
import { CandidateDraftModule } from './candidate-draft/candidate-draft.module';
import { UploadsModule } from './uploads/uploads.module';
import { InternalVendorsModule } from './modules/internal/vendors/internal-vendors.module';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    // Rate-limit buckets used by ThrottlerGuard on the auth controller.
    // "auth-strict" is for high-risk endpoints (login / signup / forgot-password).
    // "auth-loose"  is for low-risk endpoints (csrf / me).
    ThrottlerModule.forRoot([
      { name: 'auth-strict', ttl: 60_000,  limit: 10 },   // conservative default
      { name: 'auth-loose',  ttl: 60_000,  limit: 30 },
    ]),
    // Bull Board queue dashboard — mounted at /admin/queues
    // Protected by BullBoardAuthMiddleware (admin JWT required).
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    PrismaModule,     // global — PrismaService available everywhere
    CommonModule,     // global — PdfService / S3Service available everywhere
    EventsModule,     // global — EventsService available everywhere
    OutboxModule,     // global — OutboxService available everywhere
    AuthModule,
    VerifyModule,
    SubjectsModule,
    PackagesModule,
    DraftModule,
    CandidateDraftModule,
    UploadsModule,
    AdminModule,
    PaymentsModule,
    BulkModule,
    InternalVendorsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Guard the entire Bull Board UI behind admin-JWT auth.
    consumer
      .apply(BullBoardAuthMiddleware)
      .forRoutes(
        { path: '/admin/queues', method: RequestMethod.ALL },
        { path: '/admin/queues/*path', method: RequestMethod.ALL },
      );
  }
}
