import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Logger,
  Post,
  Req,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { S3Service } from '../common/s3.service';
import { VirusScanService } from '../common/virus-scan.service';

/** Minimal shape of a multer memory-storage file (no @types/multer installed). */
interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface RequestWithUser extends Request {
  user?: { sub?: string; role?: string };
}

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB — matches the uploader hint.

// Allowed ID document types, mapped to a canonical file extension.
const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

  constructor(
    private readonly s3: S3Service,
    private readonly virusScan: VirusScanService,
  ) {}

  /**
   * Accepts a single ID document (PDF/JPG/PNG), virus-scans it, and stores it
   * under a per-draft prefix. The subject doesn't exist yet at this point in
   * the flow, so the file lands under `id-uploads/drafts/<uuid>/…` and is
   * associated with the Subject when it's created after payment.
   */
  @Post('id-document')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_SIZE_BYTES } }),
  )
  async uploadIdDocument(
    @Req() req: RequestWithUser,
    @UploadedFile() file?: UploadedFileLike,
  ) {
    const role = req.user?.role;
    if (role !== 'owner' && role !== 'admin') {
      throw new BadRequestException('Not allowed');
    }

    if (!file || !file.buffer?.length) {
      throw new BadRequestException('No file was uploaded');
    }

    const extension = ALLOWED_TYPES[file.mimetype];
    if (!extension) {
      throw new UnsupportedMediaTypeException(
        'Only PDF, JPG, or PNG files are allowed',
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('File must be 10MB or smaller');
    }

    if (!this.s3.isConfigured) {
      throw new UnprocessableEntityException(
        'File storage is not configured on the server',
      );
    }

    // Fail-closed: only a clean buffer is ever written to S3.
    const scan = await this.virusScan.scanBuffer(file.buffer, file.originalname);
    if (!scan.clean) {
      this.logger.warn(
        `Rejected infected upload "${file.originalname}" from user ${req.user?.sub}`,
      );
      throw new UnprocessableEntityException(
        'This file failed the virus scan and was not saved',
      );
    }

    const draftId = randomUUID();
    const key = `id-uploads/drafts/${draftId}/${randomUUID()}${extension}`;
    await this.s3.upload(key, file.buffer, file.mimetype);
    const url = await this.s3.presignedUrl(key).catch(() => null);

    return {
      key,
      name: file.originalname,
      contentType: file.mimetype,
      size: file.size,
      url,
    };
  }

  /**
   * Immediately delete a previously-uploaded ID document from S3 — used when
   * the client removes or replaces a document in the form. Hard-guarded to the
   * `id-uploads/` prefix so it can only ever touch this app's own objects
   * (never anything else that may share the bucket).
   */
  @Delete('id-document')
  async deleteIdDocument(
    @Req() req: RequestWithUser,
    @Body() body: { key?: string },
  ) {
    const role = req.user?.role;
    if (role !== 'owner' && role !== 'admin') {
      throw new BadRequestException('Not allowed');
    }

    const key = (body?.key ?? '').trim();
    if (!key || !key.startsWith('id-uploads/')) {
      throw new BadRequestException('Invalid document key');
    }

    if (!this.s3.isConfigured) {
      // Nothing stored server-side to delete; treat as a success.
      return { deleted: false };
    }

    await this.s3.delete(key);
    this.logger.log(`Deleted ID document ${key} for user ${req.user?.sub}`);
    return { deleted: true };
  }
}
