import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { S3Service } from '../common/s3.service';
import { VirusScanService } from '../common/virus-scan.service';
import { DocumentUploadStatus } from '../../generated/prisma/client';
import type { CreateUploadIntentDto } from './dto/create-upload-intent.dto';
import {
  ALLOWED_CONTENT_TYPES,
  UPLOAD_JOBS,
  UPLOAD_QUEUES,
  UPLOAD_URL_TTL_SECONDS,
  finalizeJobId,
  scanJobId,
} from './uploads.constants';

const S = DocumentUploadStatus;

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly virusScan: VirusScanService,
    @InjectQueue(UPLOAD_QUEUES.DOCUMENT_PROCESSING)
    private readonly documentProcessingQueue: Queue,
    @InjectQueue(UPLOAD_QUEUES.VIRUS_SCAN)
    private readonly virusScanQueue: Queue,
  ) {}

  // ─── Producer helpers (deterministic jobId → idempotent enqueue) ──────────

  private enqueueFinalize(uploadSessionId: string): void {
    this.documentProcessingQueue
      .add(
        UPLOAD_JOBS.FINALIZE,
        { uploadSessionId },
        {
          jobId: finalizeJobId(uploadSessionId),
          attempts: 5,
          backoff: { type: 'exponential', delay: 20_000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      )
      .catch((err: unknown) =>
        this.logger.warn(
          `Eager finalize dispatch failed (reconcile will retry): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
  }

  private enqueueScan(uploadSessionId: string): void {
    this.virusScanQueue
      .add(
        UPLOAD_JOBS.SCAN,
        { uploadSessionId },
        {
          jobId: scanJobId(uploadSessionId),
          attempts: 5,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      )
      .catch((err: unknown) =>
        this.logger.warn(
          `Eager scan dispatch failed (reconcile will retry): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
  }

  // ─── API surface ─────────────────────────────────────────────────────────

  /**
   * Create an upload session, presign a direct-to-S3 PUT, and return the URL.
   * The API never touches the bytes — the client PUTs them straight to S3.
   */
  async createIntent(userId: string, dto: CreateUploadIntentDto) {
    if (!this.s3.isConfigured) {
      throw new UnprocessableEntityException(
        'File storage is not configured on the server',
      );
    }
    const extension = ALLOWED_CONTENT_TYPES[dto.contentType];
    if (!extension) {
      throw new UnsupportedMediaTypeException(
        'Only PDF, JPG, or PNG files are allowed',
      );
    }

    const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000);

    // Create the row first so its id anchors the S3 key. s3Key is unique +
    // NOT NULL, so seed a placeholder we overwrite once the real key is known.
    const session = await this.prisma.documentUploadSession.create({
      data: {
        userId,
        category: dto.category,
        contentType: dto.contentType,
        expectedSizeBytes: dto.sizeBytes,
        originalFilename: dto.filename,
        status: S.INTENT_CREATED,
        s3Key: `intent:${randomUUID()}`,
        expiresAt,
      },
    });

    // Keep the historical key shape so admin draft re-signing + the
    // `id-uploads/` delete guard keep working unchanged.
    const key = `id-uploads/drafts/${session.id}/${randomUUID()}${extension}`;
    const { uploadUrl, requiredHeaders } = await this.s3.createPresignedPutUrl(
      key,
      dto.contentType,
      UPLOAD_URL_TTL_SECONDS,
    );

    await this.prisma.documentUploadSession.update({
      where: { id: session.id },
      data: { s3Key: key, status: S.PRESIGNED },
    });

    return {
      uploadSessionId: session.id,
      key,
      uploadUrl,
      requiredHeaders,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * The client has finished PUTting to S3. Mark the session confirmed and
   * eagerly enqueue finalize (deterministic jobId). If the eager add is lost,
   * the reconcile sweep re-drives it — delivery is guaranteed either way.
   */
  async confirm(userId: string, uploadSessionId: string) {
    const session = await this.prisma.documentUploadSession.findFirst({
      where: { id: uploadSessionId, userId },
    });
    if (!session) {
      throw new NotFoundException('Upload session not found');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Upload session has expired');
    }

    // Stamp confirmedAt only while still PRESIGNED (idempotent on repeat calls).
    await this.prisma.documentUploadSession.updateMany({
      where: { id: session.id, status: S.PRESIGNED },
      data: { confirmedAt: new Date() },
    });

    this.enqueueFinalize(session.id);
    return { status: 'processing' as const };
  }

  /** Poll target. Returns the key + a fresh presigned GET only once CLEAN. */
  async getStatus(userId: string, uploadSessionId: string) {
    const session = await this.prisma.documentUploadSession.findFirst({
      where: { id: uploadSessionId, userId },
    });
    if (!session) {
      throw new NotFoundException('Upload session not found');
    }

    if (session.status === S.CLEAN) {
      const url = await this.s3.presignedUrl(session.s3Key).catch(() => null);
      return {
        status: session.status,
        key: session.s3Key,
        url,
        name: session.originalFilename,
        contentType: session.contentType,
        size: session.actualSize ?? session.expectedSizeBytes,
      };
    }

    return { status: session.status };
  }

  /**
   * Presign a batch of stored image keys for preview. Used by the candidate /
   * client forms to render their own uploaded documents (and re-render on
   * resume from a saved draft) without exposing anything but the object key.
   * Legacy base64 / http values pass through. Non-app keys resolve to null.
   */
  async signKeys(keys: string[]): Promise<Record<string, string | null>> {
    const unique = Array.from(new Set(keys.filter((k) => typeof k === 'string' && k)));
    const out: Record<string, string | null> = {};
    await Promise.all(
      unique.map(async (key) => {
        if (
          !key.startsWith('data:') &&
          !key.startsWith('http') &&
          !key.startsWith('id-uploads/')
        ) {
          out[key] = null; // not one of our objects — never sign it
          return;
        }
        out[key] = await this.s3.resolveViewableUrl(key);
      }),
    );
    return out;
  }

  /** Immediately delete a stored object (prefix-guarded to this app). */
  async deleteDocument(key: string) {
    const trimmed = (key ?? '').trim();
    if (!trimmed || !trimmed.startsWith('id-uploads/')) {
      throw new BadRequestException('Invalid document key');
    }
    if (!this.s3.isConfigured) {
      return { deleted: false };
    }
    await this.s3.delete(trimmed);
    return { deleted: true };
  }

  // ─── Job handlers (called by processors; idempotent) ──────────────────────

  /**
   * Verify the client's direct PUT actually landed and matches the declared
   * size, then hand off to virus scanning. Re-reads state and early-returns so
   * it's safe to run any number of times (eager + reconcile).
   */
  async processFinalize(uploadSessionId: string): Promise<void> {
    const session = await this.prisma.documentUploadSession.findUnique({
      where: { id: uploadSessionId },
    });
    if (!session) return;

    // Terminal / already-scanning → nothing to finalize.
    if (
      session.status === S.CLEAN ||
      session.status === S.INFECTED ||
      session.status === S.EXPIRED ||
      session.status === S.FAILED
    ) {
      return;
    }
    // Object already verified — just make sure the scan is queued.
    if (session.status === S.COMPLETED || session.status === S.SCANNING) {
      this.enqueueScan(session.id);
      return;
    }
    // Only a PRESIGNED (and, in practice, confirmed) session is finalizable.
    if (session.status !== S.PRESIGNED) return;

    // headObject throws when the object isn't there yet → BullMQ retries with
    // backoff, covering a slow or not-yet-finished client PUT within the
    // presign window.
    const head = await this.s3.headObject(session.s3Key);
    if (!head.size || head.size <= 0) {
      throw new Error('Uploaded object is empty or missing');
    }
    if (head.size !== session.expectedSizeBytes) {
      throw new Error(
        `Uploaded object size ${head.size} does not match declared ${session.expectedSizeBytes}`,
      );
    }

    await this.prisma.documentUploadSession.update({
      where: { id: session.id },
      data: {
        status: S.COMPLETED,
        etag: head.etag ?? undefined,
        actualSize: head.size,
      },
    });

    this.enqueueScan(session.id);
  }

  /**
   * ClamAV scan (fail-closed). CLEAN → activate (downloadable); INFECTED →
   * quarantine (status set, never served). Idempotent.
   */
  async processScan(uploadSessionId: string): Promise<void> {
    const session = await this.prisma.documentUploadSession.findUnique({
      where: { id: uploadSessionId },
    });
    if (!session) return;

    if (session.status === S.CLEAN || session.status === S.INFECTED) {
      return; // already decided
    }
    if (session.status !== S.COMPLETED && session.status !== S.SCANNING) {
      return; // not ready (finalize hasn't verified the object yet)
    }

    await this.prisma.documentUploadSession.update({
      where: { id: session.id },
      data: { status: S.SCANNING },
    });

    const buffer = await this.s3.getObjectBuffer(session.s3Key);
    const scan = await this.virusScan.scanBuffer(buffer, session.originalFilename);

    if (scan.clean) {
      await this.prisma.documentUploadSession.update({
        where: { id: session.id },
        data: { status: S.CLEAN, scanStatus: 'CLEAN' },
      });
      this.logger.log(`Upload ${session.id} scanned CLEAN`);
    } else {
      await this.prisma.documentUploadSession.update({
        where: { id: session.id },
        data: { status: S.INFECTED, scanStatus: 'INFECTED' },
      });
      this.logger.warn(
        `Upload ${session.id} scanned INFECTED (${session.originalFilename}) — quarantined`,
      );
    }
  }

  // ─── Failure bookkeeping (from @OnWorkerEvent once retries exhausted) ──────

  async markFinalizeFailed(uploadSessionId: string, message: string): Promise<void> {
    await this.prisma.documentUploadSession.updateMany({
      where: {
        id: uploadSessionId,
        status: { in: [S.PRESIGNED, S.COMPLETED] },
      },
      data: {
        status: S.FAILED,
        lastError: message.slice(0, 500),
        attempts: { increment: 1 },
      },
    });
  }

  async markScanFailed(uploadSessionId: string, message: string): Promise<void> {
    await this.prisma.documentUploadSession.updateMany({
      where: {
        id: uploadSessionId,
        status: { in: [S.COMPLETED, S.SCANNING] },
      },
      data: {
        status: S.FAILED,
        lastError: message.slice(0, 500),
        attempts: { increment: 1 },
      },
    });
  }

  // ─── Reconcile / expiry sweep (repeatable job, every 60s) ─────────────────

  async reconcile(): Promise<{ expired: number; finalized: number; scanned: number }> {
    const now = new Date();

    // 1) Expire un-confirmed intents/presigns past their TTL.
    const expired = await this.prisma.documentUploadSession.updateMany({
      where: {
        status: { in: [S.INTENT_CREATED, S.PRESIGNED] },
        expiresAt: { lt: now },
        confirmedAt: null,
      },
      data: { status: S.EXPIRED },
    });

    // 2) Re-drive confirmed-but-unfinalized sessions (crash between confirm
    //    and finalize completing).
    const toFinalize = await this.prisma.documentUploadSession.findMany({
      where: {
        status: S.PRESIGNED,
        confirmedAt: { not: null },
        expiresAt: { gte: now },
      },
      select: { id: true },
      take: 100,
    });
    for (const s of toFinalize) this.enqueueFinalize(s.id);

    // 3) Re-drive sessions stuck between finalize and a completed scan.
    const toScan = await this.prisma.documentUploadSession.findMany({
      where: { status: { in: [S.COMPLETED, S.SCANNING] } },
      select: { id: true },
      take: 100,
    });
    for (const s of toScan) this.enqueueScan(s.id);

    return {
      expired: expired.count,
      finalized: toFinalize.length,
      scanned: toScan.length,
    };
  }
}
