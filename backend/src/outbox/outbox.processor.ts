import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OutboxService } from './outbox.service';

@Processor('outbox')
export class OutboxProcessor extends WorkerHost {
  private readonly logger = new Logger(OutboxProcessor.name);
  constructor(private readonly outbox: OutboxService) { super(); }

  async process(job: Job<{ eventId?: string }>): Promise<void> {
    if (job.name === 'reconcile') {
      const result = await this.outbox.reconcile();
      this.logger.log(`Outbox reconcile swept ${result.swept} event(s)`);
      return;
    }
    if (job.data.eventId) {
      await this.outbox.processEvent(job.data.eventId);
    }
  }
}
