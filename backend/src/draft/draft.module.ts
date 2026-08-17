import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DraftService } from './draft.service';
import { DraftProcessor } from './draft.processor';
import { SubjectsService } from '../subjects/subjects.service';
import { ReportModule } from '../subjects/report.module';

@Module({
  imports: [BullModule.registerQueue({ name: 'subject-draft' }), ReportModule],
  providers: [DraftService, DraftProcessor, SubjectsService],
  exports: [DraftService],
})
export class DraftModule {}
