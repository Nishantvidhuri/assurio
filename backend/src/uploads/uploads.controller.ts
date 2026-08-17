import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UploadsService } from './uploads.service';
import { CreateUploadIntentDto } from './dto/create-upload-intent.dto';

interface RequestWithUser extends Request {
  user?: { sub?: string; role?: string };
}

/**
 * Durable, crash-safe document uploads via presigned direct-to-S3 PUT.
 *
 *   POST /uploads/intent        → presign a PUT: { uploadSessionId, key, uploadUrl, requiredHeaders }
 *   PUT  <uploadUrl>            → client sends bytes straight to S3 (not through us)
 *   POST /uploads/:id/confirm   → enqueue durable finalize + scan
 *   GET  /uploads/:id           → poll { status }; when CLEAN → { key, url, ... }
 *   DELETE /uploads/id-document → remove a stored object (prefix-guarded)
 */
@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  // owner/admin drive the client "add candidate" form; candidate drives their
  // own self-fill upload. All three use the same durable pipeline; the session
  // is scoped to req.user.sub either way.
  private callerId(req: RequestWithUser): string {
    const role = req.user?.role;
    if (role !== 'owner' && role !== 'admin' && role !== 'candidate') {
      throw new BadRequestException('Not allowed');
    }
    const userId = req.user?.sub;
    if (!userId) {
      throw new BadRequestException('Not allowed');
    }
    return userId;
  }

  @Post('intent')
  createIntent(@Req() req: RequestWithUser, @Body() dto: CreateUploadIntentDto) {
    return this.uploads.createIntent(this.callerId(req), dto);
  }

  @Post(':id/confirm')
  confirm(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.uploads.confirm(this.callerId(req), id);
  }

  @Get(':id')
  getStatus(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.uploads.getStatus(this.callerId(req), id);
  }

  /** Presign stored image keys for preview (own uploaded docs / draft resume). */
  @Post('sign')
  async sign(@Req() req: RequestWithUser, @Body() body: { keys?: string[] }) {
    this.callerId(req);
    const keys = Array.isArray(body?.keys) ? body.keys : [];
    return { urls: await this.uploads.signKeys(keys) };
  }

  @Delete('id-document')
  deleteIdDocument(@Req() req: RequestWithUser, @Body() body: { key?: string }) {
    this.callerId(req);
    return this.uploads.deleteDocument(body?.key ?? '');
  }
}
