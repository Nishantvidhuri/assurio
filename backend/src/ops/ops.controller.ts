import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OpsService } from './ops.service';

interface RequestWithUser extends Request {
  user?: { sub?: string; role?: string };
}

/**
 * Internal Operations API — queue health + active alerts. Admin-only, same
 * guard pattern as AdminController (JwtAuthGuard + in-controller role check).
 */
@Controller('admin/ops')
@UseGuards(JwtAuthGuard)
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  private requireAdmin(req: RequestWithUser): void {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Admins only');
    }
  }

  @Get('overview')
  overview(@Req() req: RequestWithUser) {
    this.requireAdmin(req);
    return this.ops.getOverview();
  }

  @Post('alerts/:id/acknowledge')
  acknowledge(@Req() req: RequestWithUser, @Param('id') id: string) {
    this.requireAdmin(req);
    return this.ops.acknowledgeAlert(id, req.user?.sub);
  }

  @Post('reconciliation/run')
  runReconciliation(@Req() req: RequestWithUser) {
    this.requireAdmin(req);
    return this.ops.runReconciliation();
  }
}
