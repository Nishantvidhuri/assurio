import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  MessageEvent,
  Param,
  Post,
  Req,
  Res,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EventsService } from '../common/events.service';
import { BulkService, type BulkCandidate } from './bulk.service';

interface RequestWithUser extends Request {
  user?: { sub?: string; role?: string };
}

@Controller('subjects/bulk')
@UseGuards(JwtAuthGuard)
export class BulkController {
  constructor(
    private readonly bulk: BulkService,
    private readonly events: EventsService,
  ) {}

  /**
   * POST /subjects/bulk
   * Body: { candidates: [{ name, email, phone?, role?, panNumber?, aadhaarNumber? }] }
   * Returns: { batchId }
   */
  @Post()
  async enqueue(
    @Req() req: RequestWithUser,
    @Body() body: { candidates?: unknown[] },
  ) {
    const userId = this.requireOwner(req);

    if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
      throw new BadRequestException('candidates must be a non-empty array');
    }
    if (body.candidates.length > 500) {
      throw new BadRequestException('Maximum 500 candidates per batch');
    }

    const candidates: BulkCandidate[] = body.candidates.map((row, i) => {
      const r = row as Record<string, unknown>;
      const name = String(r.name || '').trim();
      const email = String(r.email || '').trim().toLowerCase();
      if (!name) throw new BadRequestException(`Row ${i + 1}: name is required`);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new BadRequestException(`Row ${i + 1}: invalid email "${email}"`);
      }
      return {
        name,
        email,
        phone: r.phone ? String(r.phone).trim() : undefined,
        role: r.role ? String(r.role).trim() : undefined,
        panNumber: r.panNumber ? String(r.panNumber).trim() : undefined,
        aadhaarNumber: r.aadhaarNumber ? String(r.aadhaarNumber).trim() : undefined,
      };
    });

    const batchId = await this.bulk.enqueue(userId, candidates);
    return { batchId, total: candidates.length };
  }

  /**
   * GET /subjects/bulk/:batchId
   * Returns live batch progress.
   */
  @Get(':batchId')
  async status(@Req() req: RequestWithUser, @Param('batchId') batchId: string) {
    const userId = this.requireOwner(req);
    return this.bulk.getStatus(userId, batchId);
  }

  /**
   * GET /subjects/bulk/:batchId/events
   * SSE stream — emits batch state on every progress update.
   */
  @Sse(':batchId/events')
  streamBatch(
    @Param('batchId') batchId: string,
    @Res() res: Response,
  ): Observable<MessageEvent> {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    return this.events.stream(this.events.batchChannel(batchId));
  }

  private requireOwner(req: RequestWithUser): string {
    if (req.user?.role === 'candidate') throw new ForbiddenException('Account holder access required');
    const userId = req.user?.sub;
    if (!userId) throw new BadRequestException('Missing user');
    return userId;
  }
}
