import { Global, Module, OnModuleInit } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Queue } from 'bullmq';
import { OutboxService } from './outbox.service';
import { OutboxProcessor } from './outbox.processor';
import { EmailService } from '../subjects/email.service';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({ name: 'outbox' }),
    BullBoardModule.forFeature({ name: 'outbox', adapter: BullMQAdapter }),
  ],
  providers: [OutboxService, OutboxProcessor, EmailService],
  exports: [OutboxService],
})
export class OutboxModule implements OnModuleInit {
  constructor(@InjectQueue('outbox') private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'reconcile',
      {},
      { repeat: { every: 60_000 }, jobId: 'outbox-reconcile' },
    );
  }
}
