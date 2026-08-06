import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CandidateDraftController } from './candidate-draft.controller';
import { CandidateDraftService } from './candidate-draft.service';

@Module({
  imports: [AuthModule],
  controllers: [CandidateDraftController],
  providers: [CandidateDraftService],
})
export class CandidateDraftModule {}
