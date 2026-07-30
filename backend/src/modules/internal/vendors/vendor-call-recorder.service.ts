import { Injectable, Logger } from '@nestjs/common';
import {
  CurrencyCode,
  VendorCostSource,
  VendorName,
} from '../../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma.service';
import { VendorCostService } from './vendor-cost.service';

export interface RecordVendorCallInput {
  vendor: VendorName;
  /** Endpoint path as called; a query string, if present, is stripped. */
  endpoint: string;
  httpMethod: string;
  /** Epoch ms captured immediately before the outbound request. */
  startedAt: number;
  httpStatusCode?: number;
  success: boolean;
  errorMessage?: string;
  /**
   * Parsed vendor response, used ONLY to resolve vendor-reported/bundled cost
   * (e.g. KonnectNXT). Never persisted — vendor payloads carry candidate PII.
   */
  responseForCost?: unknown;
}

/**
 * Records one VendorApiCallAudit row per real outbound vendor API call so the
 * internal Vendor Management dashboards derive from actual platform usage
 * rather than seeded demo data.
 *
 * Fire-and-forget: recording runs in the background and never blocks or fails a
 * verification. Request and response bodies are intentionally NOT stored — only
 * the endpoint, outcome, latency and resolved buy-side cost — because vendor
 * payloads contain candidate PII (PAN, Aadhaar, DOB, names).
 */
@Injectable()
export class VendorCallRecorderService {
  private readonly logger = new Logger(VendorCallRecorderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly costService: VendorCostService,
  ) {}

  /** Non-blocking. Resolves cost and writes the audit row in the background. */
  record(input: RecordVendorCallInput): void {
    void this.persist(input).catch((error) => {
      // Auditing must never break a verification — swallow and log.
      this.logger.warn(
        `Failed to record vendor call (${input.vendor} ${input.endpoint}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  private async persist(input: RecordVendorCallInput): Promise<void> {
    const callAt = new Date();
    const durationMs = Math.max(0, Date.now() - input.startedAt);
    const endpoint = stripQuery(input.endpoint);

    // Only successful calls are billable; a failed call carries no charge.
    const cost = input.success
      ? await this.costService.resolveCallCost(
          input.vendor,
          endpoint,
          callAt,
          input.responseForCost,
        )
      : {
          billable: false,
          costAmount: null as number | null,
          costCurrency: null as CurrencyCode | null,
          costSource: VendorCostSource.NONE,
        };

    await this.prisma.vendorApiCallAudit.create({
      data: {
        vendor: input.vendor,
        endpoint,
        httpMethod: input.httpMethod,
        httpStatusCode: input.httpStatusCode ?? null,
        durationMs,
        // Payloads are deliberately omitted (candidate PII); the endpoint alone
        // powers the dashboards' per-endpoint aggregation.
        requestPayload: { endpoint },
        success: input.success,
        errorMessage: input.success ? null : (input.errorMessage ?? null),
        attemptNumber: 1,
        maxAttempts: 1,
        billable: cost.billable,
        costAmount: cost.billable ? cost.costAmount : null,
        costCurrency: cost.billable ? cost.costCurrency : null,
        costSource: cost.costSource,
      },
    });
  }
}

function stripQuery(endpoint: string): string {
  const queryIndex = endpoint.indexOf('?');
  return queryIndex === -1 ? endpoint : endpoint.slice(0, queryIndex);
}
