import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { VendorName } from '../../../../generated/prisma/client';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { ListVendorCallsQueryDto } from './dto/list-vendor-calls-query.dto';
import { UpdateVendorSettingsDto } from './dto/update-vendor-settings.dto';
import { VendorAnalyticsQueryDto } from './dto/vendor-analytics-query.dto';
import { InternalVendorCallsService } from './internal-vendor-calls.service';
import { InternalVendorsService } from './internal-vendors.service';
import { VendorBalanceService } from './vendor-balance.service';
import {
  TestDataVisibilityService,
  normalizeAuth,
  type RequestWithAuth,
} from './compat';

/**
 * Vendor Management API — ported 1:1 from Recriauth. Route paths are kept
 * byte-identical (`v1/internal/vendors/...`) because the ported frontend
 * module calls them verbatim through shared/http/api-client.
 *
 * Recriauth gates these with AccessJwtGuard + a system-permission decorator;
 * Assurio uses JwtAuthGuard plus the same in-controller admin check that
 * AdminController uses.
 */
@Controller('v1/internal/vendors')
@UseGuards(JwtAuthGuard)
export class InternalVendorsController {
  constructor(
    private readonly vendorsService: InternalVendorsService,
    private readonly callsService: InternalVendorCallsService,
    private readonly balanceService: VendorBalanceService,
    private readonly testDataVisibility: TestDataVisibilityService,
  ) {}

  // Static segments are declared before the `:code` param route so they are
  // matched first (Express routing is registration-order within a controller).

  @Get('overview')
  getOverview(
    @Query() query: VendorAnalyticsQueryDto,
    @Req() req: RequestWithAuth,
  ) {
    return this.vendorsService.getOverview(query, this.requireAdmin(req));
  }

  // Admin-triggered live balance refresh. POST + two segments, so it never
  // collides with the `@Get(':code')` param route below.
  @Post('balances/refresh')
  async refreshBalances(@Req() req: RequestWithAuth) {
    this.requireAdmin(req);
    const results = await this.balanceService.syncBalances();
    return { results };
  }

  @Get('calls')
  async listCalls(
    @Query() query: ListVendorCallsQueryDto,
    @Req() req: RequestWithAuth,
  ) {
    const authed = this.requireAdmin(req);
    const excludeTestData = await this.testDataVisibility.shouldHideTestData(
      authed.auth?.sub,
    );
    return this.callsService.listCalls(query, excludeTestData);
  }

  @Get('calls/:id')
  getCall(@Param('id') id: string, @Req() req: RequestWithAuth) {
    this.requireAdmin(req);
    return this.callsService.getCall(id);
  }

  @Get(':code')
  getVendorDetail(
    @Param('code', new ParseEnumPipe(VendorName)) code: VendorName,
    @Query() query: VendorAnalyticsQueryDto,
    @Req() req: RequestWithAuth,
  ) {
    return this.vendorsService.getVendorDetail(
      code,
      query,
      this.requireAdmin(req),
    );
  }

  @Get(':code/health')
  getVendorHealth(
    @Param('code', new ParseEnumPipe(VendorName)) code: VendorName,
    @Query() query: VendorAnalyticsQueryDto,
    @Req() req: RequestWithAuth,
  ) {
    return this.vendorsService.getVendorHealth(
      code,
      query,
      this.requireAdmin(req),
    );
  }

  @Patch(':code/settings')
  updateSettings(
    @Param('code', new ParseEnumPipe(VendorName)) code: VendorName,
    @Body() dto: UpdateVendorSettingsDto,
    @Req() req: RequestWithAuth,
  ) {
    return this.vendorsService.updateSettings(
      code,
      dto,
      this.requireAdmin(req),
    );
  }

  /** Admin-only, then normalise `req.user` → `req.auth` for the ported code. */
  private requireAdmin(req: RequestWithAuth): RequestWithAuth {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return normalizeAuth(req);
  }
}
