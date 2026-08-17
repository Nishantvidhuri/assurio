import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  OperationalAlertSeverity,
  OperationalAlertStatus,
  OperationalAlertType,
} from '../../generated/prisma/client';

export interface RaiseAlertInput {
  dedupeKey: string;
  type: OperationalAlertType;
  severity: OperationalAlertSeverity;
  title: string;
  message: string;
  queueName?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Self-healing operational alerts (ported from Recriauth). `raise` upserts on
 * `dedupeKey`: first occurrence creates an OPEN alert; repeats bump the count,
 * refresh `lastOccurredAt`, and re-open a previously acked/resolved alert.
 * `resolveByDedupeKey` clears it when the condition goes away.
 */
@Injectable()
export class OperationalAlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async raise(input: RaiseAlertInput) {
    const now = new Date();
    return this.prisma.operationalAlert.upsert({
      where: { dedupeKey: input.dedupeKey },
      create: {
        dedupeKey: input.dedupeKey,
        type: input.type,
        severity: input.severity,
        status: OperationalAlertStatus.OPEN,
        queueName: input.queueName ?? null,
        title: input.title,
        message: input.message,
        metadata: (input.metadata ?? undefined) as never,
        firstOccurredAt: now,
        lastOccurredAt: now,
      },
      update: {
        type: input.type,
        severity: input.severity,
        title: input.title,
        message: input.message,
        queueName: input.queueName ?? null,
        metadata: (input.metadata ?? undefined) as never,
        // Re-open and re-count on recurrence.
        status: OperationalAlertStatus.OPEN,
        occurrenceCount: { increment: 1 },
        lastOccurredAt: now,
        acknowledgedAt: null,
        acknowledgedByUserId: null,
        resolvedAt: null,
      },
    });
  }

  /** Mark an alert resolved once its condition clears. No-op if not open. */
  async resolveByDedupeKey(dedupeKey: string): Promise<void> {
    await this.prisma.operationalAlert.updateMany({
      where: {
        dedupeKey,
        status: { in: [OperationalAlertStatus.OPEN, OperationalAlertStatus.ACKNOWLEDGED] },
      },
      data: { status: OperationalAlertStatus.RESOLVED, resolvedAt: new Date() },
    });
  }

  /** Acknowledge an open alert (records who + when). No-op if already resolved. */
  async acknowledge(alertId: string, userId?: string) {
    const alert = await this.prisma.operationalAlert.findUnique({
      where: { id: alertId },
    });
    if (!alert || alert.status === OperationalAlertStatus.RESOLVED) return alert;
    return this.prisma.operationalAlert.update({
      where: { id: alertId },
      data: {
        status: OperationalAlertStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        acknowledgedByUserId: userId ?? null,
      },
    });
  }

  /** Open + acknowledged alerts — feeds the "Active alerts" panel + count. */
  listActive(limit = 25) {
    return this.prisma.operationalAlert.findMany({
      where: {
        status: {
          in: [OperationalAlertStatus.OPEN, OperationalAlertStatus.ACKNOWLEDGED],
        },
      },
      orderBy: [{ severity: 'desc' }, { lastOccurredAt: 'desc' }],
      take: limit,
    });
  }
}
