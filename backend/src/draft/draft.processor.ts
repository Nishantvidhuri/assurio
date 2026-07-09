import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DraftService } from './draft.service';

@Processor('subject-draft')
export class DraftProcessor extends WorkerHost {
  private readonly logger = new Logger(DraftProcessor.name);

  constructor(private readonly draft: DraftService) {
    super();
  }

  async process(job: Job<{ subjectId: string }>): Promise<void> {
    const { subjectId } = job.data;
    this.logger.log(`Applying draft for subject ${subjectId}`);
    await this.draft.apply(subjectId, job.id!);
  }
}
