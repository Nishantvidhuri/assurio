import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DraftService } from './draft.service';
import { DraftProcessor } from './draft.processor';
import { SubjectsService } from '../subjects/subjects.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'subject-draft' })],
  providers: [DraftService, DraftProcessor, SubjectsService],
  exports: [DraftService],
})
export class DraftModule {}
