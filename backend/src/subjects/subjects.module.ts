import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DraftModule } from '../draft/draft.module';
import { VerifyModule } from '../verify/verify.module';
import { SubjectsController } from './subjects.controller';
import { InviteController } from './invite.controller';
import { CandidateController } from './candidate.controller';
import { BillingController } from './billing.controller';
import { VerifyLinkController } from './verify-link.controller';
import { SubjectsService } from './subjects.service';
import { SubjectVerificationService } from './subject-verification.service';
import { EmailService } from './email.service';
import { UsersService } from '../users/users.service';

@Module({
  imports: [AuthModule, DraftModule, VerifyModule],
  controllers: [
    SubjectsController,
    InviteController,
    CandidateController,
    BillingController,
    VerifyLinkController,
  ],
  providers: [
    SubjectsService,
    SubjectVerificationService,
    EmailService,
    UsersService,
  ],
})
export class SubjectsModule {}
