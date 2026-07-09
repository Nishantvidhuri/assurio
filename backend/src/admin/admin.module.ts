import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module';
import { SubjectsService } from '../subjects/subjects.service';
import { UsersService } from '../users/users.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({ name: 'candidate-invite' }),
  ],
  controllers: [AdminController],
  providers: [AdminService, SubjectsService, UsersService],
})
export class AdminModule {}
