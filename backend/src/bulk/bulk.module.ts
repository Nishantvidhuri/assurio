import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BulkController } from './bulk.controller';
import { BulkService } from './bulk.service';
import { BulkProcessor } from './bulk.processor';
import { SubjectsService } from '../subjects/subjects.service';
import { UsersService } from '../users/users.service';
import { AuthModule } from '../auth/auth.module';
import { ReportModule } from '../subjects/report.module';

@Module({
  imports: [
    AuthModule,
    ReportModule,
    BullModule.registerQueue({ name: 'candidate-invite' }),
    BullBoardModule.forFeature({
      name: 'candidate-invite',
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [BulkController],
  providers: [BulkService, BulkProcessor, SubjectsService, UsersService],
})
export class BulkModule {}
