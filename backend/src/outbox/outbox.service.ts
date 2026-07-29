import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma.service';
import { OutboxEvent } from '../../generated/prisma/client';
import { EmailService } from '../subjects/email.service';

export type OutboxEventType =
  | 'email.invite'
  | 'email.password-reset';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('outbox') private readonly queue: Queue,
    private readonly email: EmailService,
  ) {}

  async emit(
    eventType: OutboxEventType,
    payload: Record<string, unknown>,
    opts?: { idempotencyKey?: string },
  ): Promise<OutboxEvent> {
    if (opts?.idempotencyKey) {
      const existing = await this.prisma.outboxEvent.findFirst({
        where: {
          idempotencyKey: opts.idempotencyKey,
          status: { in: ['pending', 'processing', 'sent'] },
        },
      });
      if (existing) {
        this.logger.log(
          `Outbox: skipping duplicate event (idempotencyKey=${opts.idempotencyKey})`,
        );
        return existing;
      }
    }

    const event = await this.prisma.outboxEvent.create({
      data: {
        eventType,
        payload: payload as unknown as Record<string, string>,
        idempotencyKey: opts?.idempotencyKey ?? null,
      },
    });

    await this.queue.add('process', { eventId: event.id });
    return event;
  }

  async processEvent(eventId: string): Promise<void> {
    const event = await this.prisma.outboxEvent.findUnique({ where: { id: eventId } });
    if (!event) {
      this.logger.warn(`Outbox: event ${eventId} not found`);
      return;
    }

    if (event.status === 'sent' || event.status === 'failed') return;

    const processing = await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: { status: 'processing', attempts: { increment: 1 } },
    });

    try {
      await this.dispatch(processing);
      await this.prisma.outboxEvent.update({
        where: { id: eventId },
        data: { status: 'sent', processedAt: new Date() },
      });
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      const attempts = processing.attempts;
      const isFinal = attempts >= processing.maxAttempts;
      await this.prisma.outboxEvent.update({
        where: { id: eventId },
        data: {
          lastError: message,
          status: isFinal ? 'failed' : 'pending',
          processAfter: isFinal
            ? undefined
            : new Date(Date.now() + Math.pow(2, attempts) * 10_000),
        },
      });
      throw err;
    }
  }

  private async dispatch(event: OutboxEvent): Promise<void> {
    const p = event.payload as Record<string, string>;

    switch (event.eventType) {
      case 'email.invite':
        await this.email.sendInvite(p.to, p.name, p.inviteUrl);
        break;

      case 'email.password-reset':
        await this.email.sendPasswordReset(p.to, p.name, p.resetUrl);
        break;

      default:
        throw new Error(`Unknown outbox event type: ${(event as OutboxEvent).eventType}`);
    }
  }

  async reconcile(): Promise<{ swept: number }> {
    const now = new Date();
    const events = await this.prisma.outboxEvent.findMany({
      where: { status: 'pending', processAfter: { lte: now } },
      take: 100,
    });
    const eligible = events.filter((e) => e.attempts < e.maxAttempts);
    for (const event of eligible) {
      await this.queue.add('process', { eventId: event.id });
    }
    return { swept: eligible.length };
  }

  async recentEvents(limit = 20) {
    const events = await this.prisma.outboxEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      status: e.status,
      attempts: e.attempts,
      maxAttempts: e.maxAttempts,
      target: this.extractTarget(e.payload as Record<string, string>),
      processedAt: e.processedAt?.toISOString() ?? null,
      lastError: e.lastError,
      idempotencyKey: e.idempotencyKey,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  private extractTarget(payload: Record<string, string>): string {
    if (payload.to) return payload.to;
    if (payload.phone) return payload.phone;
    return '—';
  }

  async stats(): Promise<{ pending: number; processing: number; sent: number; failed: number }> {
    const [pending, processing, sent, failed] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { status: 'pending' } }),
      this.prisma.outboxEvent.count({ where: { status: 'processing' } }),
      this.prisma.outboxEvent.count({ where: { status: 'sent' } }),
      this.prisma.outboxEvent.count({ where: { status: 'failed' } }),
    ]);
    return { pending, processing, sent, failed };
  }
}
