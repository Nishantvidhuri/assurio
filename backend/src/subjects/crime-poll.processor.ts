import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../common/prisma.service';
import { SubjectVerificationService } from './subject-verification.service';
import {
  CRIME_POLL_MAX_AGE_MS,
  CRIME_POLL_QUEUE,
} from './crime-poll.constants';

/**
 * Durable poller for court/criminal-record checks.
 *
 * KonnectNxt searches court records manually and documents a 24-48 hour
 * turnaround, so a check initiated today typically completes tomorrow — long
 * after the request that started it, and across at least one deploy. The
 * in-process poll in SubjectVerificationService only covers the first few
 * minutes; this repeatable sweep is what actually finishes most checks.
 *
 * It is a sweep over database state rather than a per-subject delayed job on
 * purpose: the set of outstanding checks is derived fresh every tick from
 * `crimeRequestId set + crimeResult null`, so a check can never be orphaned by
 * a lost job, and a restart resumes with no bookkeeping.
 */
@Processor(CRIME_POLL_QUEUE)
export class CrimePollProcessor extends WorkerHost {
  private readonly logger = new Logger(CrimePollProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: SubjectVerificationService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const pending = await this.prisma.subject.findMany({
      // DbNull, not JsonNull: an unset Json column is SQL NULL. The reset path
      // in "Recall API" writes Prisma.DbNull too, so a re-run is picked up.
      where: {
        crimeRequestId: { not: null },
        crimeResult: { equals: Prisma.DbNull },
      },
      select: { id: true, crimeRequestId: true, crimeRequestedAt: true },
      // Bounded so one tick can't stall on a huge backlog; the next tick takes
      // the rest, and ordering by oldest first keeps it fair.
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    if (pending.length === 0) return;

    this.logger.log(`Polling ${pending.length} pending crime check(s)`);
    const now = Date.now();
    for (const s of pending) {
      try {
        // Stop chasing a check that is past the vendor's window. Rows predating
        // crimeRequestedAt have no stamp — poll those rather than expiring
        // them on a timestamp we never recorded.
        const age = s.crimeRequestedAt
          ? now - s.crimeRequestedAt.getTime()
          : 0;
        if (age > CRIME_POLL_MAX_AGE_MS) {
          await this.verification.expireCrimeCheck(s.id);
          continue;
        }
        await this.verification.pollCrimeOnce(s.id, s.crimeRequestId!);
      } catch (e) {
        // One unreachable vendor call must not abort the whole sweep — this
        // subject is simply retried on the next tick.
        this.logger.warn(
          `Crime poll failed for ${s.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }
}
