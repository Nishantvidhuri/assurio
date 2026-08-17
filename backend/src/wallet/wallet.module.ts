import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { ConsentSettlementService } from './consent-settlement.service';

/**
 * Client wallet: prepaid balance backed by an immutable double-checked ledger
 * (WalletService) plus the consent state machine that turns a pending
 * verification hold into either consumed spend (consent granted → checks run)
 * or an automatic refund (declined / expired / deleted). PrismaService and
 * EventsService come from their global modules.
 *
 * Global because several feature modules re-provide SubjectsService (draft,
 * bulk, admin, report) and every copy needs the wallet — same pattern as
 * PrismaModule / EventsModule.
 */
@Global()
@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [WalletController],
  providers: [WalletService, ConsentSettlementService],
  exports: [WalletService, ConsentSettlementService],
})
export class WalletModule {}
