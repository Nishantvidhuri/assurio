import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma.service';
import { Subject } from '../../generated/prisma/client';
import { eventsForSubject, summarizeEvents } from '../subjects/billing';
import { S3Service } from '../common/s3.service';
import { OutboxService } from '../outbox/outbox.service';

function crimeRisk(result: unknown): string | null {
  const data = (result as { data?: { risk_assessment?: { risk_type?: string } } } | null)?.data;
  return data?.risk_assessment?.risk_type ?? null;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    @InjectQueue('candidate-invite')
    private readonly candidateInviteQueue: Queue,
    private readonly outbox: OutboxService,
  ) {}

  async queueHealth() {
    const queue = this.candidateInviteQueue;
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'paused');
    const [failedJobs, waitingJobs, recentJobs] = await Promise.all([
      queue.getFailed(0, 0),
      queue.getWaiting(0, 0),
      queue.getJobs(['completed', 'failed', 'active'], 0, 14),
    ]);

    const oldestFailed =
      failedJobs.length > 0 ? new Date(failedJobs[0].timestamp).toISOString() : null;
    const oldestWaiting =
      waitingJobs.length > 0 ? new Date(waitingJobs[0].timestamp).toISOString() : null;

    const failed = counts.failed ?? 0;
    const health = failed === 0 ? 'HEALTHY' : failed <= 3 ? 'DEGRADED' : 'CRITICAL';

    const [outboxStats, recentOutboxEvents] = await Promise.all([
      this.outbox.stats(),
      this.outbox.recentEvents(20),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      thresholds: { deadJob: 1, backlogSec: 120 },
      queues: [
        {
          name: 'candidate-invite',
          label: 'Candidate Invites',
          health,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed,
          paused: counts.paused ?? 0,
          oldestWaiting,
          oldestFailed,
        },
      ],
      recentJobs: recentJobs.map((job) => ({
        queue: 'candidate-invite',
        name: job.name,
        status: job.finishedOn ? (job.failedReason ? 'failed' : 'completed') : 'active',
        progress: typeof job.progress === 'number' ? job.progress : 0,
        attempts: job.attemptsMade,
        timestamp: job.timestamp,
        finishedOn: job.finishedOn ?? null,
        failedReason: job.failedReason ?? null,
      })),
      outboxStats,
      recentOutboxEvents,
    };
  }

  async overview() {
    const [clients, all] = await Promise.all([
      this.prisma.user.count({ where: { role: { not: 'admin' } } }),
      this.prisma.subject.findMany(),
    ]);
    return {
      clients,
      candidates: all.length,
      invited: all.filter((s) => s.status === 'invited').length,
      active: all.filter((s) => s.status === 'active').length,
      panChecks: all.filter((s) => s.panResult).length,
      aadhaarChecks: all.filter((s) => s.aadhaarResult).length,
      crimeChecks: all.filter((s) => s.crimeResult).length,
    };
  }

  async monthlyStats() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);

    const [newClients, allSubjects, paidInvoices] = await Promise.all([
      this.prisma.user.count({ where: { role: { not: 'admin' }, createdAt: { gte: start } } }),
      this.prisma.subject.findMany(),
      this.prisma.invoice.findMany({ where: { status: 'paid', paidAt: { gte: start } } }),
    ]);

    let checksThisMonth = 0;
    let checksDoneThisMonth = 0;

    for (const s of allSubjects) {
      if (s.createdAt >= start) checksThisMonth += 1;
      if (s.updatedAt >= start) {
        const events = eventsForSubject(s);
        checksDoneThisMonth += events.length;
      }
    }

    const earningsThisMonth = paidInvoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
    return { checksThisMonth, clientsThisMonth: newClients, earningsThisMonth, checksDoneThisMonth };
  }

  async listSubjects() {
    const [docs, users] = await Promise.all([
      this.prisma.subject.findMany({ orderBy: { updatedAt: 'desc' } }),
      this.prisma.user.findMany(),
    ]);
    const ownerMap = new Map(users.map((u) => [u.id, { name: u.name, email: u.email }]));
    return docs.map((d) => {
      const owner = ownerMap.get(d.userId);
      return {
        id: d.id,
        name: d.name,
        role: d.role,
        email: d.email,
        phone: d.phone,
        status: d.status,
        ownerName: owner?.name ?? 'Unknown',
        ownerEmail: owner?.email ?? '',
        hasPan: Boolean(d.panResult),
        hasAadhaar: Boolean(d.aadhaarResult),
        hasPanImages: Boolean(d.panFront || d.panBack),
        crimeRisk: crimeRisk(d.crimeResult),
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      };
    });
  }

  async listClients() {
    const [users, counts] = await Promise.all([
      this.prisma.user.findMany({ where: { role: { not: 'admin' } } }),
      this.prisma.subject.groupBy({ by: ['userId'], _count: { id: true } }),
    ]);
    const countMap = new Map(counts.map((c) => [c.userId, c._count.id]));
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      candidateCount: countMap.get(u.id) ?? 0,
      createdAt: u.createdAt,
    }));
  }

  async getClient(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role === 'admin') throw new NotFoundException('Client not found');

    const docs = await this.prisma.subject.findMany({
      where: { userId: id },
      orderBy: { updatedAt: 'desc' },
    });

    const subjects = docs.map((d) => ({
      id: d.id,
      name: d.name,
      role: d.role,
      email: d.email,
      phone: d.phone,
      status: d.status,
      ownerName: user.name,
      ownerEmail: user.email,
      hasPan: Boolean(d.panResult),
      hasAadhaar: Boolean(d.aadhaarResult),
      hasPanImages: Boolean(d.panFront || d.panBack),
      crimeRisk: crimeRisk(d.crimeResult),
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    const billing = summarizeEvents(docs.flatMap((d) => eventsForSubject(d)));
    return {
      client: {
        id: user.id,
        name: user.name,
        email: user.email,
        candidateCount: docs.length,
        createdAt: user.createdAt,
      },
      subjects,
      billing,
    };
  }

  async listInvoices() {
    const [invoices, users, subjects] = await Promise.all([
      this.prisma.invoice.findMany({ where: { status: 'paid' }, orderBy: { paidAt: 'desc' } }),
      this.prisma.user.findMany({ where: { role: { not: 'admin' } } }),
      this.prisma.subject.findMany(),
    ]);

    const usersById = new Map(users.map((u) => [u.id, { name: u.name, email: u.email }]));
    const subjectByEmail = new Map<string, Subject>();
    for (const s of subjects) {
      if (s.email) subjectByEmail.set(s.email.toLowerCase(), s);
    }

    const presignedMap = new Map<string, string>();
    if (this.s3.isConfigured) {
      await Promise.all(
        invoices
          .filter((inv) => inv.pdfS3Key)
          .map(async (inv) => {
            try {
              const url = await this.s3.presignedUrl(inv.pdfS3Key as string);
              presignedMap.set(inv.id, url);
            } catch {
              // Non-fatal
            }
          }),
      );
    }

    return invoices.map((inv) => {
      const client = usersById.get(inv.userId);
      const subject = inv.customerEmail
        ? subjectByEmail.get(inv.customerEmail.toLowerCase())
        : undefined;
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        candidateName: inv.customerName,
        candidateEmail: inv.customerEmail,
        clientName: client?.name ?? 'Admin',
        clientEmail: client?.email ?? '',
        paidAt: inv.paidAt,
        total: inv.total,
        currency: inv.currency,
        status: inv.status,
        checks: {
          pan: Boolean(subject?.panResult),
          aadhaar: Boolean(subject?.aadhaarResult),
          crime: Boolean(subject?.crimeResult),
        },
        subjectId: subject ? subject.id : null,
        razorpayPaymentId: inv.razorpayPaymentId,
        pdfUrl: presignedMap.get(inv.id) ?? null,
      };
    });
  }

  async getSubject(id: string) {
    const doc = await this.prisma.subject.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Subject not found');
    const owner = await this.prisma.user.findUnique({ where: { id: doc.userId } });
    return {
      id: doc.id,
      name: doc.name,
      role: doc.role,
      email: doc.email,
      phone: doc.phone,
      status: doc.status,
      ownerName: owner?.name ?? 'Unknown',
      ownerEmail: owner?.email ?? '',
      panFront: doc.panFront,
      panBack: doc.panBack,
      panNumber: doc.panNumber,
      panResult: doc.panResult,
      aadhaarResult: doc.aadhaarResult,
      digilockerClientId: doc.digilockerClientId,
      crimeRequestId: doc.crimeRequestId,
      crimeResult: doc.crimeResult,
      verificationLog: (doc.verificationLog ?? []) as unknown[],
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
