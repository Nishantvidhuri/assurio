import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UploadsController } from './uploads.controller';

/**
 * AuthModule provides JwtService/JwtAuthGuard for the route guard.
 * S3Service and VirusScanService come from the global CommonModule.
 */
@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
})
export class UploadsModule {}
