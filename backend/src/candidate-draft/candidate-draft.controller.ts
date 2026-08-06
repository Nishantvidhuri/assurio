import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CandidateDraftService } from './candidate-draft.service';

interface AuthedRequest extends Request {
  user?: { sub?: string };
}

/**
 * Owner-scoped drafts for the Add-Candidate form. Each draft has its own id so
 * it can be listed in "Your Candidates" and resumed. Keyed by the authenticated
 * user's id (JWT `sub`).
 */
@Controller('v1/candidate-draft')
@UseGuards(JwtAuthGuard)
export class CandidateDraftController {
  constructor(private readonly draft: CandidateDraftService) {}

  @Post()
  create(
    @Req() req: AuthedRequest,
    @Body() body: { data?: Prisma.InputJsonValue },
  ) {
    return this.draft.create(this.userId(req), body?.data ?? {});
  }

  @Get()
  async list(@Req() req: AuthedRequest) {
    return { drafts: await this.draft.list(this.userId(req)) };
  }

  @Get(':id')
  async getOne(@Req() req: AuthedRequest, @Param('id') id: string) {
    return { data: await this.draft.get(this.userId(req), id) };
  }

  @Put(':id')
  async save(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: { data?: Prisma.InputJsonValue },
  ) {
    await this.draft.save(this.userId(req), id, body?.data ?? {});
    return { ok: true };
  }

  @Delete(':id')
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.draft.remove(this.userId(req), id);
    return { ok: true };
  }

  private userId(req: AuthedRequest): string {
    const sub = req.user?.sub;
    if (!sub) throw new UnauthorizedException('Missing user');
    return sub;
  }
}
