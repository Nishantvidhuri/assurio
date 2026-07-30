import { Module } from '@nestjs/common';
import { VendorCostModule } from './vendor-cost.module';
import { VendorCallRecorderService } from './vendor-call-recorder.service';

/**
 * Provides VendorCallRecorderService, which records real outbound vendor API
 * calls into the audit trail. Imported by VerifyModule (the only place that
 * makes vendor calls). Depends on the buy-side cost resolver; PrismaService is
 * global.
 */
@Module({
  imports: [VendorCostModule],
  providers: [VendorCallRecorderService],
  exports: [VendorCallRecorderService],
})
export class VendorCallRecorderModule {}
