import { Module } from '@nestjs/common';
import { VendorCostService } from './vendor-cost.service';

/**
 * Provides the buy-side cost resolver. Imported by both the API module
 * (per-capability cost display) and the worker module (the cost sweep).
 */
@Module({
  providers: [VendorCostService],
  exports: [VendorCostService],
})
export class VendorCostModule {}
