import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { eventsForSubject, summarizeEvents } from './billing';
import { SubjectsService } from './subjects.service';

interface RequestWithUser extends Request {
  user?: { sub?: string; role?: string };
}

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly svc: SubjectsService) {}

  /** Client's own billing history, derived from their candidates' completed checks. */
  @Get('me')
  async me(@Req() req: RequestWithUser) {
    if (req.user?.role === 'candidate') {
      throw new ForbiddenException('Account holder access required');
    }
    const userId = req.user?.sub;
    if (!userId) throw new BadRequestException('Missing user');
    const subjects = await this.svc.list(userId);
    const events = subjects.flatMap((s) => eventsForSubject(s));
    return summarizeEvents(events);
  }
}
