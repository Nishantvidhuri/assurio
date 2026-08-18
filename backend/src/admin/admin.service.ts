import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma.service';
import { Subject } from '../../generated/prisma/client';
import { eventsForSubject, summarizeEvents } from '../subjects/billing';
import { S3Service } from '../common/s3.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  checkApplicability,
  computeSubjectProgress,
} from '../subjects/subject-progress';

function crimeRisk(result: unknown): string | null {
  const data = (result as { data?: { risk_assessment?: { risk_type?: string } } } | null)?.data;
  return data?.risk_assessment?.risk_type ?? null;
}

/**
 * Scope + doneness of the crime check, read from the one applicability source
 * the engine itself uses. The Crime column needs both so it can't promise an
 * "Awaiting result" for a check that is never coming: not applicable (no
 * address, DOB or father's name) means nothing to await, and done-without-a-
 * risk-band means it settled as a failure or a manual pass.
 */
function crimeScope(d: Subject): { applicable: boolean; done: boolean } {
  const crime = checkApplicability(d).find((c) => c.key === 'crime');
  return { applicable: Boolean(crime?.applicable), done: Boolean(crime?.done) };
}

// Progress across the applicable checks — single source of truth shared with
// the candidates list + report so every surface shows the same ratio.
const subjectProgress = computeSubjectProgress;

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
      const crime = crimeScope(d);
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
        crimeApplicable: crime.applicable,
        crimeSettled: crime.done,
        // Consent gates every check — the admin list needs it to avoid showing
        // "In progress" for a case that was refused or is still awaiting consent.
        consentStatus: d.consentStatus,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      };
    });
  }

  async listClients() {
    const [users, subjects, draftCounts, invoices] = await Promise.all([
      this.prisma.user.findMany({ where: { role: { not: 'admin' } } }),
      this.prisma.subject.findMany(),
      this.prisma.candidateFormDraft.groupBy({
        by: ['userId'],
        _count: { id: true },
      }),
      this.prisma.invoice.findMany({ where: { status: 'paid' } }),
    ]);
    const draftMap = new Map(draftCounts.map((c) => [c.userId, c._count.id]));

    // Per-client P&L: checks run + API (vendor) cost from subjects; revenue
    // from paid invoices; profit = revenue − API cost.
    type Agg = {
      subjects: number;
      checksDone: number;
      apiCost: number;
      revenue: number;
    };
    const agg = new Map<string, Agg>();
    const ensure = (uid: string): Agg => {
      let a = agg.get(uid);
      if (!a) {
        a = { subjects: 0, checksDone: 0, apiCost: 0, revenue: 0 };
        agg.set(uid, a);
      }
      return a;
    };
    for (const s of subjects) {
      const a = ensure(s.userId);
      a.subjects += 1;
      const events = eventsForSubject(s);
      a.checksDone += events.length;
      a.apiCost += events.reduce((sum, e) => sum + e.credits, 0);
    }
    for (const inv of invoices) {
      ensure(inv.userId).revenue += Number(inv.total) || 0;
    }
    const round = (n: number) => Math.round(n * 100) / 100;

    return users.map((u) => {
      const a = agg.get(u.id) ?? {
        subjects: 0,
        checksDone: 0,
        apiCost: 0,
        revenue: 0,
      };
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        candidateCount: a.subjects + (draftMap.get(u.id) ?? 0),
        checksDone: a.checksDone,
        apiCost: round(a.apiCost),
        revenue: round(a.revenue),
        profit: round(a.revenue - a.apiCost),
        createdAt: u.createdAt,
      };
    });
  }

  async getClient(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role === 'admin') throw new NotFoundException('Client not found');

    const docs = await this.prisma.subject.findMany({
      where: { userId: id },
      orderBy: { updatedAt: 'desc' },
    });

    const subjects = docs.map((d) => {
      const prog = subjectProgress(d);
      const crime = crimeScope(d);
      return {
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
        crimeApplicable: crime.applicable,
        crimeSettled: crime.done,
        consentStatus: d.consentStatus,
        checksDone: prog.done,
        checksTotal: prog.total,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      };
    });

    // In-progress drafts this client hasn't paid for yet — so the admin can see
    // what they've started and which fields are filled.
    const draftDocs = await this.prisma.candidateFormDraft.findMany({
      where: { userId: id },
      orderBy: { updatedAt: 'desc' },
    });
    const drafts = draftDocs.map((d) => ({
      id: d.id,
      data: d.data,
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
      drafts,
      billing,
    };
  }

  /** A single in-progress draft (read-only) for the admin candidate view. */
  async getDraft(id: string) {
    const draft = await this.prisma.candidateFormDraft.findUnique({
      where: { id },
    });
    if (!draft) throw new NotFoundException('Draft not found');
    const owner = await this.prisma.user.findUnique({
      where: { id: draft.userId },
    });

    // Re-sign each uploaded ID document so the admin gets a working link — the
    // URL stored on the draft at upload time has long since expired.
    const data = (draft.data ?? {}) as Record<string, unknown>;
    const rawDocs = Array.isArray(data.idDocuments) ? data.idDocuments : [];
    const idDocuments = await Promise.all(
      rawDocs.map(async (doc) => {
        const d = (doc ?? {}) as Record<string, unknown>;
        const key = typeof d.key === 'string' ? d.key : null;
        const url =
          key && this.s3.isConfigured
            ? await this.s3.presignedUrl(key).catch(() => null)
            : typeof d.url === 'string'
              ? d.url
              : null;
        return { ...d, url };
      }),
    );

    return {
      id: draft.id,
      data: { ...data, idDocuments },
      owner: owner
        ? { id: owner.id, name: owner.name, email: owner.email }
        : null,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    };
  }

  async listInvoices() {
    const [invoices, users, subjects, refunds] = await Promise.all([
      this.prisma.invoice.findMany({ where: { status: 'paid' }, orderBy: { paidAt: 'desc' } }),
      this.prisma.user.findMany({ where: { role: { not: 'admin' } } }),
      this.prisma.subject.findMany(),
      // Consent refunds are credited back to the client's wallet, so the money
      // sits with us as an unearned balance rather than being recognised
      // revenue. Surfacing it per-invoice keeps the P&L honest.
      this.prisma.walletTransaction.findMany({
        where: { reason: 'CONSENT_REFUND' },
        select: { subjectId: true, amountPaise: true },
      }),
    ]);

    const refundBySubject = new Map<string, number>();
    for (const r of refunds) {
      if (!r.subjectId) continue;
      refundBySubject.set(
        r.subjectId,
        (refundBySubject.get(r.subjectId) ?? 0) + r.amountPaise / 100,
      );
    }

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
      // API (vendor) cost for this invoice = the credits spent on the linked
      // subject's actual verification calls. Same source as the clients P&L.
      const events = subject ? eventsForSubject(subject) : [];
      const apiCost =
        Math.round(events.reduce((sum, e) => sum + e.credits, 0) * 100) / 100;
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
        apiCost,
        // Amount already returned to the client's wallet for this case.
        refunded: subject ? (refundBySubject.get(subject.id) ?? 0) : 0,
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
    const invoice = doc.email
      ? await this.prisma.invoice.findFirst({
          where: { userId: doc.userId, customerEmail: doc.email, status: 'paid' },
          orderBy: { paidAt: 'desc' },
        })
      : null;
    // Document images are stored as S3 keys (durable-upload port) or legacy
    // base64 — presign keys so the admin UI + report can render them.
    const [panFront, panBack, aadhaarFront, aadhaarBack] = await Promise.all([
      this.s3.resolveViewableUrl(doc.panFront),
      this.s3.resolveViewableUrl(doc.panBack),
      this.s3.resolveViewableUrl(doc.aadhaarFront),
      this.s3.resolveViewableUrl(doc.aadhaarBack),
    ]);
    return {
      id: doc.id,
      name: doc.name,
      role: doc.role,
      email: doc.email,
      phone: doc.phone,
      status: doc.status,
      ownerId: doc.userId,
      ownerName: owner?.name ?? 'Unknown',
      ownerEmail: owner?.email ?? '',
      clientName: owner?.name ?? '',
      // Drives the closed/awaiting-consent state in the shared report view.
      consentStatus: doc.consentStatus,
      creditRequestId: doc.creditRequestId,
      fatherName: doc.fatherName,
      amountPaid: invoice ? Number(invoice.total) : null,
      caseRef: invoice?.invoiceNumber || 'VER-' + doc.id.slice(-6).toUpperCase(),
      panFront,
      panBack,
      panNumber: doc.panNumber,
      aadhaarFront,
      aadhaarBack,
      aadhaarNumber: doc.aadhaarNumber,
      dob: doc.dob,
      permanentAddress: doc.permanentAddress,
      drivingLicense: doc.drivingLicense,
      voterId: doc.voterId,
      passportFileNo: doc.passportFileNo,
      uan: doc.uan,
      panResult: doc.panResult,
      aadhaarResult: doc.aadhaarResult,
      voterResult: doc.voterResult,
      passportResult: doc.passportResult,
      dlResult: doc.dlResult,
      employmentResult: doc.employmentResult,
      creditResult: doc.creditResult,
      digilockerClientId: doc.digilockerClientId,
      crimeRequestId: doc.crimeRequestId,
      crimeResult: doc.crimeResult,
      verificationLog: (doc.verificationLog ?? []) as unknown[],
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
