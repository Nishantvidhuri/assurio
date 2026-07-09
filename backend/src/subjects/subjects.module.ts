import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DraftModule } from '../draft/draft.module';
import { SubjectsController } from './subjects.controller';
import { InviteController } from './invite.controller';
import { CandidateController } from './candidate.controller';
import { BillingController } from './billing.controller';
import { SubjectsService } from './subjects.service';
import { EmailService } from './email.service';
import { UsersService } from '../users/users.service';

@Module({
  imports: [AuthModule, DraftModule],
  controllers: [
    SubjectsController,
    InviteController,
    CandidateController,
    BillingController,
  ],
  providers: [SubjectsService, EmailService, UsersService],
})
export class SubjectsModule {}
