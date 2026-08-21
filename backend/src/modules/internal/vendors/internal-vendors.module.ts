import { Module } from '@nestjs/common';
import { AuthModule } from '../../../auth/auth.module';
import { VendorCostModule } from './vendor-cost.module';
import { InternalVendorCallsService } from './internal-vendor-calls.service';
import { InternalVendorsController } from './internal-vendors.controller';
import { InternalVendorsService } from './internal-vendors.service';
import { VendorBalanceService } from './vendor-balance.service';
import {
  EventBusService,
  InternalUserActivityService,
  TestDataVisibilityService,
  VendorConfigService,
} from './compat';

/**
 * Vendor Management (ported from Recriauth). Recriauth composes this from
 * separate platform modules (user-activity, vendor-config, event-bus,
 * test-data); Recrify supplies those surfaces from ./compat, registered here
 * as providers so the ported services' constructor injection is unchanged.
 */
@Module({
  imports: [AuthModule, VendorCostModule],
  controllers: [InternalVendorsController],
  providers: [
    InternalVendorsService,
    InternalVendorCallsService,
    VendorBalanceService,
    VendorConfigService,
    TestDataVisibilityService,
    EventBusService,
    InternalUserActivityService,
  ],
})
export class InternalVendorsModule {}
