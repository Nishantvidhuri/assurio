import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Queue } from 'bullmq';
import { AuthModule } from '../auth/auth.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { DocumentProcessingProcessor } from './document-processing.processor';
import { VirusScanProcessor } from './virus-scan.processor';
import {
  RECONCILE_EVERY_MS,
  RECONCILE_JOB_ID,
  UPLOAD_JOBS,
  UPLOAD_QUEUES,
} from './uploads.constants';

/**
 * AuthModule provides JwtAuthGuard for the route guard. PrismaService,
 * S3Service and VirusScanService come from the global Prisma/Common modules.
 * The two queues + their processors run in-process; jobs persist in Redis so
 * a crash mid-upload resumes on restart, and the repeatable reconcile job is
 * the durable backstop.
 */
@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue(
      { name: UPLOAD_QUEUES.DOCUMENT_PROCESSING },
      { name: UPLOAD_QUEUES.VIRUS_SCAN },
    ),
    BullBoardModule.forFeature(
      { name: UPLOAD_QUEUES.DOCUMENT_PROCESSING, adapter: BullMQAdapter },
      { name: UPLOAD_QUEUES.VIRUS_SCAN, adapter: BullMQAdapter },
    ),
  ],
  controllers: [UploadsController],
  providers: [UploadsService, DocumentProcessingProcessor, VirusScanProcessor],
})
export class UploadsModule implements OnModuleInit {
  constructor(
    @InjectQueue(UPLOAD_QUEUES.DOCUMENT_PROCESSING)
    private readonly documentProcessingQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // Repeatable reconcile/expiry sweep — crash-recovery backstop. Mirrors the
    // outbox module's repeatable-job precedent (not @Cron). Stable jobId keeps
    // exactly one schedule across restarts.
    await this.documentProcessingQueue.add(
      UPLOAD_JOBS.RECONCILE,
      {},
      {
        repeat: { every: RECONCILE_EVERY_MS },
        jobId: RECONCILE_JOB_ID,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
