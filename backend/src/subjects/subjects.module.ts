import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Queue } from 'bullmq';
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
import { ReportModule } from './report.module';
import { WalletModule } from '../wallet/wallet.module';
import { PackagesModule } from '../packages/packages.module';
import { CrimePollProcessor } from './crime-poll.processor';
import {
  CRIME_POLL_EVERY_MS,
  CRIME_POLL_JOB,
  CRIME_POLL_JOB_ID,
  CRIME_POLL_QUEUE,
} from './crime-poll.constants';

@Module({
  imports: [
    AuthModule,
    DraftModule,
    VerifyModule,
    ReportModule,
    WalletModule,
    PackagesModule,
    BullModule.registerQueue({ name: CRIME_POLL_QUEUE }),
    BullBoardModule.forFeature({
      name: CRIME_POLL_QUEUE,
      adapter: BullMQAdapter,
    }),
  ],
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
    CrimePollProcessor,
  ],
})
export class SubjectsModule implements OnModuleInit {
  constructor(
    @InjectQueue(CRIME_POLL_QUEUE) private readonly crimePollQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // Court records take the vendor 24-48 hours, so the sweep — not the
    // in-process poll — is what finishes most crime checks. Stable jobId keeps
    // exactly one schedule across restarts.
    await this.crimePollQueue.add(
      CRIME_POLL_JOB,
      {},
      {
        repeat: { every: CRIME_POLL_EVERY_MS },
        jobId: CRIME_POLL_JOB_ID,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
