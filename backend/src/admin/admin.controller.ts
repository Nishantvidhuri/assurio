import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubjectsService } from '../subjects/subjects.service';
import { AdminService } from './admin.service';

interface RequestWithUser extends Request {
  user?: { sub?: string; role?: string };
}

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly subjectsSvc: SubjectsService,
  ) {}

  @Get('overview')
  overview(@Req() req: RequestWithUser) {
    this.requireAdmin(req);
    return this.admin.overview();
  }

  @Get('monthly')
  monthly(@Req() req: RequestWithUser) {
    this.requireAdmin(req);
    return this.admin.monthlyStats();
  }

  @Get('clients')
  clients(@Req() req: RequestWithUser) {
    this.requireAdmin(req);
    return this.admin.listClients();
  }

  @Get('clients/:id')
  client(@Req() req: RequestWithUser, @Param('id') id: string) {
    this.requireAdmin(req);
    return this.admin.getClient(id);
  }

  @Get('subjects')
  subjects(@Req() req: RequestWithUser) {
    this.requireAdmin(req);
    return this.admin.listSubjects();
  }

  @Get('invoices')
  invoices(@Req() req: RequestWithUser) {
    this.requireAdmin(req);
    return this.admin.listInvoices();
  }

  @Get('ops/queues')
  opsQueues(@Req() req: RequestWithUser) {
    this.requireAdmin(req);
    return this.admin.queueHealth();
  }

  @Get('subjects/:id')
  subject(@Req() req: RequestWithUser, @Param('id') id: string) {
    this.requireAdmin(req);
    return this.admin.getSubject(id);
  }

  @Patch('subjects/:id')
  async patchSubject(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    this.requireAdmin(req);
    const allowed = ['crimeRequestId', 'crimeResult', 'status'] as const;
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }

    const doc = await this.subjectsSvc.patchAny(id, patch);

    return this.admin.getSubject(doc.id);
  }

  private requireAdmin(req: RequestWithUser): void {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
  }
}
