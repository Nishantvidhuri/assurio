import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module';
import { SubjectsService } from '../subjects/subjects.service';
import { UsersService } from '../users/users.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { InvoiceLifecycleService } from '../payments/invoice-lifecycle.service';
import { ReportModule } from '../subjects/report.module';

@Module({
  imports: [
    AuthModule,
    ReportModule,
    BullModule.registerQueue({ name: 'candidate-invite' }),
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    SubjectsService,
    UsersService,
    InvoiceLifecycleService,
  ],
})
export class AdminModule {}
