import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import type { CandidateJobData } from './bulk.processor';

export interface BulkCandidate {
  name: string;
  email: string;
  phone?: string;
  role?: string;
  panNumber?: string;
  aadhaarNumber?: string;
}

@Injectable()
export class BulkService {
  constructor(
    @InjectQueue('candidate-invite') private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async enqueue(userId: string, candidates: BulkCandidate[]): Promise<string> {
    const batchId = randomUUID();

    await this.prisma.bulkBatch.create({
      data: {
        batchId,
        userId,
        total: candidates.length,
        done: 0,
        failed: 0,
        status: 'processing',
        failedRows: [],
      },
    });

    const jobs = candidates.map((candidate, rowIndex) => ({
      name: 'invite',
      data: { batchId, rowIndex, userId, candidate } satisfies CandidateJobData,
      opts: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 3000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    }));

    await this.queue.addBulk(jobs);
    return batchId;
  }

  async getStatus(userId: string, batchId: string) {
    const batch = await this.prisma.bulkBatch.findFirst({
      where: { batchId, userId },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    return batch;
  }
}
