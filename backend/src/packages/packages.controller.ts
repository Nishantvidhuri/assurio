import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PackagesService } from './packages.service';

interface RequestWithUser extends Request {
  user?: { sub?: string; role?: string };
}

interface PackageBody {
  name?: string;
  priceInr?: number;
  description?: string;
  active?: boolean;
  isDefault?: boolean;
}

interface DiscountBody {
  code?: string;
  percentOff?: number;
  active?: boolean;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  // ── Checkout (any authenticated user) ──────────────────────────────
  @Get('packages')
  active() {
    return this.packages.listActivePackages();
  }

  @Get('packages/default')
  async defaultPackage() {
    return this.packages.defaultPackage();
  }

  @Post('packages/validate-discount')
  validateDiscount(@Body() body: { code?: string }) {
    return this.packages.validateDiscount(body?.code || '');
  }

  // ── Admin: packages ────────────────────────────────────────────────
  @Get('admin/packages')
  adminList(@Req() req: RequestWithUser) {
    this.requireAdmin(req);
    return this.packages.listPackages();
  }

  @Post('admin/packages')
  adminCreate(@Req() req: RequestWithUser, @Body() body: PackageBody) {
    this.requireAdmin(req);
    return this.packages.createPackage({
      name: body.name || '',
      priceInr: Number(body.priceInr) || 0,
      description: body.description,
      active: body.active,
      isDefault: body.isDefault,
    });
  }

  @Patch('admin/packages/:id')
  adminUpdate(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: PackageBody,
  ) {
    this.requireAdmin(req);
    return this.packages.updatePackage(id, body);
  }

  @Delete('admin/packages/:id')
  adminDelete(@Req() req: RequestWithUser, @Param('id') id: string) {
    this.requireAdmin(req);
    return this.packages.deletePackage(id);
  }

  // ── Admin: discount codes ──────────────────────────────────────────
  @Get('admin/discounts')
  adminDiscounts(@Req() req: RequestWithUser) {
    this.requireAdmin(req);
    return this.packages.listDiscounts();
  }

  @Post('admin/discounts')
  adminCreateDiscount(@Req() req: RequestWithUser, @Body() body: DiscountBody) {
    this.requireAdmin(req);
    return this.packages.createDiscount({
      code: body.code || '',
      percentOff: Number(body.percentOff) || 0,
      active: body.active,
    });
  }

  @Patch('admin/discounts/:id')
  adminUpdateDiscount(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: DiscountBody,
  ) {
    this.requireAdmin(req);
    return this.packages.updateDiscount(id, body);
  }

  @Delete('admin/discounts/:id')
  adminDeleteDiscount(@Req() req: RequestWithUser, @Param('id') id: string) {
    this.requireAdmin(req);
    return this.packages.deleteDiscount(id);
  }

  private requireAdmin(req: RequestWithUser): void {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Admin only');
    }
  }
}
