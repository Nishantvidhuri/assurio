import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { AuthModule } from '../auth/auth.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';
import { QueueMonitoringService } from './queue-monitoring.service';
import { ObservabilityService } from './observability.service';
import { OperationalAlertsService } from './operational-alerts.service';
import { MaintenanceProcessor } from './maintenance.processor';
import { MAINTENANCE_QUEUE } from './ops.constants';
import { WalletModule } from '../wallet/wallet.module';

/**
 * Operations monitoring: queue health + self-healing alerts, powered by a
 * per-minute observability sweep on the `maintenance` queue.
 * PrismaService / OutboxService come from their global modules.
 */
@Module({
  imports: [
    AuthModule,
    WalletModule,
    // Register every monitored queue here so QueueMonitoringService can inject
    // read-only handles, plus the maintenance queue for the sweep.
    BullModule.registerQueue(
      { name: 'outbox' },
      { name: 'candidate-invite' },
      { name: 'subject-draft' },
      { name: 'document-processing' },
      { name: 'virus-scan' },
      { name: 'report-generation' },
      { name: 'invoice-pdf' },
      { name: MAINTENANCE_QUEUE },
    ),
    // Surface the queues not already registered elsewhere in the Bull Board UI.
    BullBoardModule.forFeature(
      { name: 'subject-draft', adapter: BullMQAdapter },
      { name: 'document-processing', adapter: BullMQAdapter },
      { name: 'virus-scan', adapter: BullMQAdapter },
      { name: MAINTENANCE_QUEUE, adapter: BullMQAdapter },
    ),
  ],
  controllers: [OpsController],
  providers: [
    OpsService,
    QueueMonitoringService,
    ObservabilityService,
    OperationalAlertsService,
    MaintenanceProcessor,
  ],
})
export class OpsModule {}
