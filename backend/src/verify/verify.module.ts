import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VendorCallRecorderModule } from '../modules/internal/vendors/vendor-call-recorder.module';
import { VerifyController } from './verify.controller';
import { VerifyService } from './verify.service';

@Module({
  imports: [AuthModule, VendorCallRecorderModule],
  controllers: [VerifyController],
  providers: [VerifyService],
  exports: [VerifyService],
})
export class VerifyModule {}
