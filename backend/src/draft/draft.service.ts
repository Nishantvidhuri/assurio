import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma.service';
import { EventsService } from '../common/events.service';
import { SubjectPatch, SubjectsService } from '../subjects/subjects.service';

const jobId = (subjectId: string) => `draft:${subjectId}`;

@Injectable()
export class DraftService {
  private readonly logger = new Logger(DraftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subjects: SubjectsService,
    private readonly events: EventsService,
    @InjectQueue('subject-draft') private readonly queue: Queue,
  ) {}

  async save(subjectId: string, patch: Record<string, unknown>): Promise<void> {
    // Cancel any existing delayed job so the 20s timer resets.
    const existing = await this.queue.getJob(jobId(subjectId));
    if (existing) await existing.remove().catch(() => {});

    // Persist draft immediately (survives page refresh / other browsers).
    await this.prisma.subjectDraft.upsert({
      where: { subjectId },
      create: { subjectId, patch: patch as any },
      update: { patch: patch as any },
    });

    const job = await this.queue.add(
      'apply',
      { subjectId },
      { delay: 20_000, jobId: jobId(subjectId) },
    );

    // Store the job ID so the processor can verify it's still current.
    await this.prisma.subjectDraft.update({
      where: { subjectId },
      data: { jobId: job.id },
    });
  }

  get(subjectId: string) {
    return this.prisma.subjectDraft.findUnique({ where: { subjectId } });
  }

  async discard(subjectId: string): Promise<void> {
    const draft = await this.prisma.subjectDraft.findUnique({ where: { subjectId } });
    if (!draft) return;
    if (draft.jobId) {
      const job = await this.queue.getJob(draft.jobId);
      if (job) await job.remove().catch(() => {});
    }
    await this.prisma.subjectDraft.delete({ where: { subjectId } });
  }

  async apply(subjectId: string, currentJobId: string): Promise<void> {
    const draft = await this.prisma.subjectDraft.findUnique({ where: { subjectId } });
    if (!draft) return;

    // Guard against a stale job firing after a newer one was queued.
    if (draft.jobId !== currentJobId) {
      this.logger.debug(`Skipping stale draft job ${currentJobId} for subject ${subjectId}`);
      return;
    }

    await this.subjects.patchOwn(subjectId, draft.patch as SubjectPatch);
    await this.prisma.subjectDraft.delete({ where: { subjectId } });

    // Notify SSE listeners that the draft was committed.
    const updated = await this.subjects.findById(subjectId);
    if (updated) this.events.emit(this.events.subjectChannel(subjectId), updated);
  }
}
