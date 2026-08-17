import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ReportGenerationService, REPORT_QUEUE } from './report-generation.service';
import { ReportGenerationProcessor } from './report-generation.processor';

/**
 * Owns the debounced report-PDF generation pipeline (queue + in-process
 * worker). Exported as a standalone module so every module that provides its
 * own SubjectsService copy (subjects, draft, bulk, admin) can inject
 * ReportGenerationService without re-registering the queue.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: REPORT_QUEUE }),
    BullBoardModule.forFeature({ name: REPORT_QUEUE, adapter: BullMQAdapter }),
  ],
  providers: [ReportGenerationService, ReportGenerationProcessor],
  exports: [ReportGenerationService],
})
export class ReportModule {}
