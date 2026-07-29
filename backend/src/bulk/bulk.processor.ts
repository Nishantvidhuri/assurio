import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SubjectsService } from '../subjects/subjects.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../common/prisma.service';
import { EventsService } from '../common/events.service';
import { toSubjectResponse } from '../subjects/subject-response';

export interface CandidateJobData {
  batchId: string;
  rowIndex: number;
  userId: string;
  candidate: {
    name: string;
    email: string;
    phone?: string;
    role?: string;
    panNumber?: string;
    aadhaarNumber?: string;
  };
}

interface BatchError {
  row: number;
  email: string;
  reason: string;
}

@Processor('candidate-invite')
export class BulkProcessor extends WorkerHost {
  private readonly logger = new Logger(BulkProcessor.name);

  constructor(
    private readonly subjects: SubjectsService,
    private readonly outbox: OutboxService,
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {
    super();
  }

  async process(job: Job<CandidateJobData>): Promise<void> {
    const { batchId, rowIndex, userId, candidate } = job.data;

    try {
      const doc = await this.subjects.create(userId, candidate);
      const response = toSubjectResponse(doc);
      const inviteUrl = response.inviteUrl as string;

      await this.outbox.emit('email.invite', {
        to: doc.email,
        name: doc.name,
        inviteUrl,
      });

      const updated = await this.prisma.bulkBatch.update({
        where: { batchId },
        data: { done: { increment: 1 } },
      });
      this.events.emit(this.events.batchChannel(batchId), updated);
    } catch (err) {
      const reason = (err as Error)?.message ?? String(err);
      this.logger.warn(`Row ${rowIndex} (${candidate.email}) failed: ${reason}`);

      const batch = await this.prisma.bulkBatch.findUnique({ where: { batchId } });
      const failedRows = ((batch?.failedRows ?? []) as unknown as BatchError[]).concat({
        row: rowIndex,
        email: candidate.email,
        reason,
      });
      const updated = await this.prisma.bulkBatch.update({
        where: { batchId },
        data: { failed: { increment: 1 }, failedRows: failedRows as any },
      });
      this.events.emit(this.events.batchChannel(batchId), updated);
    } finally {
      const batch = await this.prisma.bulkBatch.findUnique({ where: { batchId } });
      if (batch && batch.done + batch.failed >= batch.total) {
        const done = await this.prisma.bulkBatch.update({
          where: { batchId },
          data: { status: 'done' },
        });
        this.events.emit(this.events.batchChannel(batchId), done);
      }
    }
  }
}
