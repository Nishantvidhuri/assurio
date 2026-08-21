import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  VendorBillingModel,
  VendorName,
  VendorVerificationType,
} from '../../../../generated/prisma/client';
import {
  EventBusService,
  InternalTeamAccess,
  InternalUserActivityService,
  SseEventType,
  TestDataVisibilityService,
  VendorConfigService,
  type RequestWithAuth,
} from './compat';
import { PrismaService } from '../../../common/prisma.service';
import { InternalVendorCallsService } from './internal-vendor-calls.service';
import { VendorBalanceService } from './vendor-balance.service';
import { VendorCostService } from './vendor-cost.service';
import {
  VendorAnalyticsQueryDto,
  type VendorLedgerSortField,
} from './dto/vendor-analytics-query.dto';
import { UpdateVendorSettingsDto } from './dto/update-vendor-settings.dto';
import { resolveRange, startOfMonthUtc } from './vendor-analytics.util';

const DAY_MS = 24 * 60 * 60 * 1000;

/** ₹ with Indian grouping, rounded to whole rupees for display. */
function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

/** ₹ with 2 decimals — for small per-call cost figures. */
function formatInrPrecise(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}

/** Whole days from now until `date` (>= 0), or null if not set. */
function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.round((date.getTime() - Date.now()) / DAY_MS));
}

/** Sum of MTD call counts for endpoints matching a capability's prefix. */
function sumMtdByPrefix(
  byEndpoint: Map<string, number>,
  prefix: string,
): number {
  let total = 0;
  for (const [endpoint, count] of byEndpoint) {
    if (endpoint.startsWith(prefix)) total += count;
  }
  return total;
}

// A vendor whose failure rate over the window crosses this floor (with enough
// volume to be meaningful) raises a HIGH_ERROR_RATE alert on the overview.
const ALERT_MIN_CALLS = 10;
const ALERT_ERROR_RATE_PCT = 5;

// How far back to look at balance readings when estimating the daily burn rate.
const BURN_WINDOW_DAYS = 60;

// Internal roles permitted to change vendor settings. Reads are open to any
// internal admin; writes are operations-tier and above.
const VENDOR_MANAGER_ROLES: InternalTeamAccess[] = [
  InternalTeamAccess.SUPER_ADMIN,
  InternalTeamAccess.OPERATIONS,
];

/**
 * Registry layer for the internal Vendor Management module: composes the
 * overview (KPIs + alerts + expenses trend + vendor table) and per-vendor
 * detail from the Vendor/VendorCapability registry plus the audit-derived
 * metrics in InternalVendorCallsService, and owns the settings mutation.
 */
@Injectable()
export class InternalVendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly callsService: InternalVendorCallsService,
    private readonly costService: VendorCostService,
    private readonly balanceService: VendorBalanceService,
    private readonly userActivityService: InternalUserActivityService,
    private readonly eventBus: EventBusService,
    private readonly vendorConfig: VendorConfigService,
    private readonly testDataVisibility: TestDataVisibilityService,
  ) {}

  // ─── Overview ───────────────────────────────────────────────────────

  async getOverview(query: VendorAnalyticsQueryDto, req: RequestWithAuth) {
    // Keep "Avl. Balance" fresh from the vendor APIs without blocking the load:
    // throttled + fire-and-forget, so this request serves the current snapshot
    // and the next load reflects the refreshed values.
    this.balanceService.syncIfStale();

    const excludeTestData = await this.testDataVisibility.shouldHideTestData(
      req.auth?.sub,
    );
    const range = resolveRange(query);
    const monthStart = startOfMonthUtc();
    const now = new Date();
    // The vendor ledger (success rate, total calls) and the alerts panel are
    // deliberately independent of the date filter — they report all-time
    // state, so changing the range only moves the spend/API-call KPIs and the
    // expenses chart.
    const allTimeFrom = new Date(0);

    const [
      vendors,
      callsCurrent,
      callsPrevious,
      perCallSpendCurrent,
      perCallSpendPrevious,
      statsAllTime,
      spendByVendorMtd,
      spend,
      spendPrevious,
      lastFailureAt,
    ] = await Promise.all([
      this.prisma.vendor.findMany({
        where: { deletedAt: null },
        orderBy: { displayName: 'asc' },
        include: {
          capabilities: {
            orderBy: { priority: 'asc' },
            select: { displayName: true },
          },
          balanceSnapshot: true,
        },
      }),
      this.callsService.countCalls(range.from, range.to, excludeTestData),
      this.callsService.countCalls(
        range.previousFrom,
        range.previousTo,
        excludeTestData,
      ),
      this.callsService.totalSpend(range.from, range.to, excludeTestData),
      this.callsService.totalSpend(
        range.previousFrom,
        range.previousTo,
        excludeTestData,
      ),
      // All-time (not range-scoped): powers the vendor ledger + alerts.
      this.callsService.perVendorStats(allTimeFrom, now, excludeTestData),
      // Vendor table column is month-to-date spend, independent of the range.
      this.callsService.spendByVendor(monthStart, now, excludeTestData),
      this.callsService.spendSeries(range, excludeTestData),
      this.callsService.spendSeries(
        {
          ...range,
          from: range.previousFrom,
          to: range.previousTo,
        },
        excludeTestData,
      ),
      this.callsService.lastFailureAtByVendor(
        allTimeFrom,
        now,
        excludeTestData,
      ),
    ]);

    // Burn (for low-balance runway messaging) needs the vendor ids from above.
    const burnByVendor = new Map(
      await Promise.all(
        vendors
          .filter((v) => v.billingModel === VendorBillingModel.PREPAID)
          .map(
            async (v) => [v.code, await this.computeBurnPerDay(v.id)] as const,
          ),
      ),
    );

    // Subscription cost is amortized over the window and is the same for the
    // current and prior windows, so it shifts both totals equally.
    const subscriptionSpend = vendors.reduce(
      (sum, vendor) => sum + this.subscriptionWindowSpend(vendor, range.days),
      0,
    );
    const totalSpendCurrent = perCallSpendCurrent + subscriptionSpend;
    const totalSpendPrevious = perCallSpendPrevious + subscriptionSpend;

    // The expenses chart plots per-call cost, so it only includes vendors whose
    // spend varies by call. TeleCMI (flat subscription) and the in-house OCR
    // (internal / free) have no per-call cost and are excluded.
    const expenseVendors = vendors.filter(
      (vendor) =>
        vendor.billingModel !== VendorBillingModel.SUBSCRIPTION &&
        vendor.billingModel !== VendorBillingModel.INTERNAL,
    );

    const rowsWithSort = vendors.map((vendor) => {
      const stats = statsAllTime.get(vendor.code);
      const monthSpend = spendByVendorMtd.get(vendor.code) ?? 0;
      return {
        row: {
          code: vendor.code,
          displayName: vendor.displayName,
          category: vendor.category,
          status: vendor.status,
          billingModel: vendor.billingModel,
          currencyCode: vendor.currencyCode,
          capabilities: vendor.capabilities.map((c) => c.displayName),
          successRate: stats?.successRate ?? null,
          totalCalls: stats?.calls ?? 0,
          availableBalance: this.balanceLabel(vendor),
          spendMtd: this.monthlySpendLabel(vendor, monthSpend),
        },
        // Raw values behind the formatted cells, keyed by sortable column.
        sortValues: {
          vendor: vendor.displayName.toLowerCase(),
          status: vendor.status as string,
          billing: vendor.billingModel as string,
          balance: this.balanceSortValue(vendor),
          spendMtd: this.monthlySpendSortValue(vendor, monthSpend),
          successRate: stats?.successRate ?? null,
        } satisfies Record<VendorLedgerSortField, number | string | null>,
      };
    });

    const sortField = query.sortBy;
    if (sortField) {
      const dir = query.sortOrder === 'desc' ? -1 : 1;
      rowsWithSort.sort((a, b) => {
        const av = a.sortValues[sortField];
        const bv = b.sortValues[sortField];
        // Nulls (e.g. the in-house OCR has no balance/spend) always sort last.
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp =
          typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : String(av).localeCompare(String(bv));
        return dir * cmp;
      });
    }
    const vendorRows = rowsWithSort.map((entry) => entry.row);

    return {
      range: {
        label: range.label,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      kpis: {
        totalVendors: vendors.length,
        // Date-scoped KPIs carry current + previous raw values so the client
        // renders the period-over-period delta badge (client-dashboard logic).
        totalApiCalls: callsCurrent,
        totalApiCallsPreviousValue: callsPrevious,
        totalVendorSpend: formatInr(totalSpendCurrent),
        totalVendorSpendValue: totalSpendCurrent,
        totalVendorSpendPreviousValue: totalSpendPrevious,
      },
      alerts: this.buildAlerts(
        vendors,
        statsAllTime,
        burnByVendor,
        lastFailureAt,
      ),
      expenses: {
        metric: 'spend' as const,
        buckets: spend.buckets,
        series: expenseVendors.map((vendor) => ({
          vendorCode: vendor.code,
          vendorName: vendor.displayName,
          data:
            spend.byVendor.get(vendor.code) ??
            new Array<number>(spend.buckets.length).fill(0),
        })),
        previousSeries: expenseVendors.map((vendor) => ({
          vendorCode: vendor.code,
          vendorName: vendor.displayName,
          data:
            spendPrevious.byVendor.get(vendor.code) ??
            new Array<number>(spend.buckets.length).fill(0),
        })),
      },
      vendors: vendorRows,
    };
  }

  private buildAlerts(
    vendors: Array<{
      code: VendorName;
      displayName: string;
      billingModel: VendorBillingModel;
      lowBalanceThreshold: Prisma.Decimal | null;
      subscriptionRenewalAt: Date | null;
      balanceSnapshot: {
        reportedBalance: Prisma.Decimal | null;
        reportedAt: Date | null;
      } | null;
    }>,
    statsByVendor: Awaited<
      ReturnType<InternalVendorCallsService['perVendorStats']>
    >,
    burnByVendor: Map<VendorName, number | null>,
    lastFailureAt: Map<VendorName, Date>,
  ) {
    const nameByCode = new Map(vendors.map((v) => [v.code, v.displayName]));
    const alerts: Array<{
      id: string;
      vendorCode: VendorName;
      vendorName: string;
      type: 'HIGH_ERROR_RATE' | 'LOW_BALANCE';
      severity: 'warning' | 'critical';
      message: string;
      at: string | null;
    }> = [];

    for (const [code, stats] of statsByVendor.entries()) {
      if (stats.calls < ALERT_MIN_CALLS || stats.successRate === null) {
        continue;
      }
      // Rate the vendor on its own failures (network + 5xx), not 4xx
      // input-validation rejections which mean it handled a bad input correctly.
      const errorRate =
        Math.round((stats.serverFailed / stats.calls) * 1000) / 10;
      if (errorRate >= ALERT_ERROR_RATE_PCT) {
        alerts.push({
          id: `error-rate:${code}`,
          vendorCode: code,
          vendorName: nameByCode.get(code) ?? code,
          type: 'HIGH_ERROR_RATE',
          severity:
            errorRate >= ALERT_ERROR_RATE_PCT * 2 ? 'critical' : 'warning',
          message: `${errorRate}% of calls are failing`,
          at: lastFailureAt.get(code)?.toISOString() ?? null,
        });
      }
    }

    for (const vendor of vendors) {
      const threshold = vendor.lowBalanceThreshold;
      // The in-house OCR is our own service (no balance to run down), so it
      // never has a low-balance threshold.
      if (
        threshold === null ||
        vendor.billingModel === VendorBillingModel.INTERNAL
      ) {
        continue;
      }

      if (vendor.billingModel === VendorBillingModel.SUBSCRIPTION) {
        // For a subscription the threshold is a number of DAYS before the
        // renewal date — alert when the plan is closer than that.
        const daysLeft = daysUntil(vendor.subscriptionRenewalAt);
        if (daysLeft != null && daysLeft < Number(threshold)) {
          alerts.push({
            id: `low-balance:${vendor.code}`,
            vendorCode: vendor.code,
            vendorName: vendor.displayName,
            type: 'LOW_BALANCE',
            severity: 'warning',
            message: `${daysLeft} days until renewal`,
            at: null,
          });
        }
        continue;
      }

      // Prepaid: the threshold is a ₹ amount compared against the balance.
      const balance = vendor.balanceSnapshot?.reportedBalance;
      if (balance === null || balance === undefined) {
        continue;
      }
      if (Number(balance) < Number(threshold)) {
        // Prefer the shared-balance runway ("N days") when burn is known;
        // fall back to the raw amount otherwise.
        const burn = burnByVendor.get(vendor.code);
        const days =
          burn != null && burn > 0 ? Math.round(Number(balance) / burn) : null;
        alerts.push({
          id: `low-balance:${vendor.code}`,
          vendorCode: vendor.code,
          vendorName: vendor.displayName,
          type: 'LOW_BALANCE',
          severity: 'warning',
          message:
            days != null
              ? `${days} days balance remaining`
              : `Low balance — ${formatInr(Number(balance))} remaining`,
          at: vendor.balanceSnapshot?.reportedAt?.toISOString() ?? null,
        });
      }
    }

    return alerts.sort((a, b) => {
      if (a.severity === b.severity) return 0;
      return a.severity === 'critical' ? -1 : 1;
    });
  }

  // ─── Cost / balance display helpers ─────────────────────────────────

  private subscriptionWindowSpend(
    vendor: {
      billingModel: VendorBillingModel;
      subscriptionAnnualCost: Prisma.Decimal | null;
    },
    windowDays: number,
  ): number {
    if (
      vendor.billingModel === VendorBillingModel.SUBSCRIPTION &&
      vendor.subscriptionAnnualCost
    ) {
      return (Number(vendor.subscriptionAnnualCost) * windowDays) / 365;
    }
    return 0;
  }

  private balanceLabel(vendor: {
    billingModel: VendorBillingModel;
    subscriptionRenewalAt: Date | null;
    balanceSnapshot: { reportedBalance: Prisma.Decimal | null } | null;
  }): string | null {
    if (vendor.billingModel === VendorBillingModel.INTERNAL) {
      return null;
    }
    if (vendor.billingModel === VendorBillingModel.SUBSCRIPTION) {
      const days = daysUntil(vendor.subscriptionRenewalAt);
      return days != null ? `${days} days left` : null;
    }
    const balance = vendor.balanceSnapshot?.reportedBalance;
    return balance != null ? formatInr(Number(balance)) : null;
  }

  // Raw numeric value behind the "Avl. Balance" cell, for sorting: days-left
  // for subscriptions, reported balance for prepaid, null for internal.
  private balanceSortValue(vendor: {
    billingModel: VendorBillingModel;
    subscriptionRenewalAt: Date | null;
    balanceSnapshot: { reportedBalance: Prisma.Decimal | null } | null;
  }): number | null {
    if (vendor.billingModel === VendorBillingModel.INTERNAL) return null;
    if (vendor.billingModel === VendorBillingModel.SUBSCRIPTION) {
      return daysUntil(vendor.subscriptionRenewalAt);
    }
    const balance = vendor.balanceSnapshot?.reportedBalance;
    return balance != null ? Number(balance) : null;
  }

  // Raw numeric value behind the "Spends MTD" cell, for sorting.
  private monthlySpendSortValue(
    vendor: {
      billingModel: VendorBillingModel;
      subscriptionAnnualCost: Prisma.Decimal | null;
    },
    monthSpend: number,
  ): number | null {
    if (vendor.billingModel === VendorBillingModel.INTERNAL) return null;
    if (vendor.billingModel === VendorBillingModel.SUBSCRIPTION) {
      return vendor.subscriptionAnnualCost
        ? Number(vendor.subscriptionAnnualCost) / 12
        : null;
    }
    return monthSpend;
  }

  // ─── Detail ─────────────────────────────────────────────────────────

  async getVendorDetail(
    code: VendorName,
    query: VendorAnalyticsQueryDto,
    req: RequestWithAuth,
  ) {
    const excludeTestData = await this.testDataVisibility.shouldHideTestData(
      req.auth?.sub,
    );
    const vendor = await this.findVendorOrThrow(code);
    const range = resolveRange(query);

    const previousRange = {
      ...range,
      from: range.previousFrom,
      to: range.previousTo,
    };
    const [
      summary,
      summaryPrevious,
      mtdByType,
      mtdByEndpoint,
      recent,
      windowSpend,
      windowSpendPrevious,
      burnPerDay,
      capabilityCosts,
    ] = await Promise.all([
      this.callsService.vendorSummary(code, range, excludeTestData),
      this.callsService.vendorSummary(code, previousRange, excludeTestData),
      this.callsService.perVerificationTypeMtd(code, excludeTestData),
      this.callsService.perEndpointMtd(code, excludeTestData),
      this.callsService.recentCalls(code, excludeTestData),
      this.callsService.vendorSpend(
        code,
        range.from,
        range.to,
        excludeTestData,
      ),
      this.callsService.vendorSpend(
        code,
        range.previousFrom,
        range.previousTo,
        excludeTestData,
      ),
      this.computeBurnPerDay(vendor.id),
      this.resolveCapabilityCosts(vendor),
    ]);

    const labelByType = new Map(
      vendor.capabilities
        .filter((c) => c.verificationType !== null)
        .map((c) => [c.verificationType as string, c.displayName]),
    );

    return {
      vendor: {
        code: vendor.code,
        displayName: vendor.displayName,
        category: vendor.category,
        status: vendor.status,
        billingModel: vendor.billingModel,
        currencyCode: vendor.currencyCode,
        settings: {
          lowBalanceThreshold:
            vendor.lowBalanceThreshold != null
              ? vendor.lowBalanceThreshold.toFixed(2)
              : null,
          requestTimeoutMs: vendor.requestTimeoutMs,
          syncReportedBalance: vendor.syncReportedBalance,
        },
      },
      range: {
        label: range.label,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      kpis: {
        availableBalance: this.balanceLabel(vendor),
        availableBalanceRunway: this.runwayLabel(
          vendor,
          burnPerDay,
          windowSpend,
          range.days,
        ),
        spend: this.windowSpendLabel(vendor, windowSpend, range.days),
        spendValue: windowSpend,
        spendPreviousValue: windowSpendPrevious,
        successRatePct: summary.successRatePct,
        successRatePreviousValue: summaryPrevious.successRatePct,
        totalApiCalls: summary.totalCalls,
        totalApiCallsPreviousValue: summaryPrevious.totalCalls,
      },
      health: {
        totalCalls: summary.totalCalls,
        success: summary.success,
        failed: summary.failed,
        avgLatencyMs: summary.avgLatencyMs,
        p95LatencyMs: summary.p95LatencyMs,
        uptimePct: summary.uptimePct,
      },
      capabilities: vendor.capabilities.map((capability) => ({
        code: capability.code,
        displayName: capability.displayName,
        verificationType: capability.verificationType,
        role: capability.role,
        enabled: capability.enabled,
        callsMtd: capability.verificationType
          ? (mtdByType.get(capability.verificationType) ?? 0)
          : capability.endpointPrefix
            ? sumMtdByPrefix(mtdByEndpoint, capability.endpointPrefix)
            : null,
        unitCost: capabilityCosts.get(capability.code) ?? null,
      })),
      recentCalls: recent.map((call) => ({
        id: call.id,
        capabilityLabel: call.verificationType
          ? (labelByType.get(call.verificationType) ?? call.verificationType)
          : call.endpoint,
        endpoint: call.endpoint,
        httpStatusCode: call.httpStatusCode,
        success: call.success,
        createdAt: call.createdAt,
      })),
    };
  }

  private monthlySpendLabel(
    vendor: {
      billingModel: VendorBillingModel;
      subscriptionAnnualCost: Prisma.Decimal | null;
    },
    monthSpend: number,
  ): string | null {
    if (vendor.billingModel === VendorBillingModel.INTERNAL) {
      return null;
    }
    if (vendor.billingModel === VendorBillingModel.SUBSCRIPTION) {
      return vendor.subscriptionAnnualCost
        ? formatInr(Number(vendor.subscriptionAnnualCost) / 12)
        : null;
    }
    return formatInr(monthSpend);
  }

  // Spend over the selected date range (detail "Spends" KPI). Subscriptions are
  // amortized over the window; internal vendors have no spend.
  private windowSpendLabel(
    vendor: {
      billingModel: VendorBillingModel;
      subscriptionAnnualCost: Prisma.Decimal | null;
    },
    windowSpend: number,
    windowDays: number,
  ): string | null {
    if (vendor.billingModel === VendorBillingModel.INTERNAL) {
      return null;
    }
    if (vendor.billingModel === VendorBillingModel.SUBSCRIPTION) {
      return vendor.subscriptionAnnualCost
        ? formatInr(this.subscriptionWindowSpend(vendor, windowDays))
        : null;
    }
    return formatInr(windowSpend);
  }

  private runwayLabel(
    vendor: {
      billingModel: VendorBillingModel;
      subscriptionRenewalAt: Date | null;
      balanceSnapshot: { reportedBalance: Prisma.Decimal | null } | null;
    },
    burnPerDay: number | null,
    windowSpend: number,
    windowDays: number,
  ): string | null {
    if (vendor.billingModel === VendorBillingModel.INTERNAL) {
      return null;
    }
    if (vendor.billingModel === VendorBillingModel.SUBSCRIPTION) {
      const days = daysUntil(vendor.subscriptionRenewalAt);
      return days != null ? `renews in ${days} days` : null;
    }
    const balance = vendor.balanceSnapshot?.reportedBalance;
    if (balance == null) {
      return null;
    }
    // Preferred: runway from the SHARED balance's real decline (all
    // environments). Requires >= 2 balance readings showing a net drop.
    if (burnPerDay != null && burnPerDay > 0) {
      return `~${Math.round(Number(balance) / burnPerDay)} days remaining`;
    }
    // Provisional until balance-decline history accrues: estimate from THIS
    // environment's spend, flagged so it isn't mistaken for the combined figure.
    const avgDailySpend = windowDays > 0 ? windowSpend / windowDays : 0;
    if (avgDailySpend > 0) {
      return `~${Math.round(Number(balance) / avgDailySpend)} days (est.)`;
    }
    return null;
  }

  // Burn rate (₹/day) from the vendor-reported balance's net decline over the
  // recent history. Top-ups (balance increases) are excluded so a recharge
  // doesn't zero out the burn. Environment-agnostic: the balance is the shared
  // account's, so this reflects total consumption across all environments.
  private async computeBurnPerDay(vendorId: string): Promise<number | null> {
    const since = new Date(Date.now() - BURN_WINDOW_DAYS * DAY_MS);
    const readings = await this.prisma.vendorBalanceReading.findMany({
      where: { vendorId, readAt: { gte: since } },
      orderBy: { readAt: 'asc' },
      select: { reportedBalance: true, readAt: true },
    });
    if (readings.length < 2) {
      return null;
    }
    let drop = 0;
    let elapsedMs = 0;
    for (let i = 1; i < readings.length; i += 1) {
      const delta =
        Number(readings[i - 1].reportedBalance) -
        Number(readings[i].reportedBalance);
      if (delta > 0) {
        drop += delta;
        elapsedMs +=
          readings[i].readAt.getTime() - readings[i - 1].readAt.getTime();
      }
    }
    if (drop <= 0 || elapsedMs <= 0) {
      return null;
    }
    return drop / (elapsedMs / DAY_MS);
  }

  private async resolveCapabilityCosts(vendor: {
    code: VendorName;
    billingModel: VendorBillingModel;
    capabilities: Array<{
      code: string;
      verificationType: VendorVerificationType | null;
      endpointPrefix: string | null;
    }>;
  }): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>();
    if (vendor.billingModel === VendorBillingModel.INTERNAL) {
      for (const capability of vendor.capabilities) {
        map.set(capability.code, formatInrPrecise(0));
      }
      return map;
    }
    await Promise.all(
      vendor.capabilities.map(async (capability) => {
        // Enum-backed capabilities resolve by verification type; non-enum ones
        // (e.g. GST lookup) resolve by their endpoint prefix.
        const rate = capability.verificationType
          ? await this.costService.getCapabilityUnitCost(
              vendor.code,
              capability.verificationType,
            )
          : capability.endpointPrefix
            ? await this.costService.getRateByEndpointPrefix(
                vendor.code,
                capability.endpointPrefix,
              )
            : null;
        map.set(capability.code, rate ? formatInrPrecise(rate.unitCost) : null);
      }),
    );
    return map;
  }

  async getVendorHealth(
    code: VendorName,
    query: VendorAnalyticsQueryDto,
    req: RequestWithAuth,
  ) {
    const excludeTestData = await this.testDataVisibility.shouldHideTestData(
      req.auth?.sub,
    );
    const range = resolveRange(query);
    return this.callsService.vendorHealth(code, range, excludeTestData);
  }

  // ─── Settings mutation ──────────────────────────────────────────────

  async updateSettings(
    code: VendorName,
    dto: UpdateVendorSettingsDto,
    req: RequestWithAuth,
  ) {
    await this.assertCanManageVendors(req);
    const vendor = await this.findVendorOrThrow(code);

    const data: Prisma.VendorUpdateInput = {};
    if (dto.lowBalanceThreshold !== undefined) {
      data.lowBalanceThreshold =
        dto.lowBalanceThreshold === null
          ? null
          : new Prisma.Decimal(dto.lowBalanceThreshold);
    }
    if (dto.requestTimeoutMs !== undefined) {
      data.requestTimeoutMs = dto.requestTimeoutMs;
    }
    if (dto.syncReportedBalance !== undefined) {
      data.syncReportedBalance = dto.syncReportedBalance;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No settings to update');
    }

    const updated = await this.prisma.vendor.update({
      where: { id: vendor.id },
      data,
      select: {
        lowBalanceThreshold: true,
        requestTimeoutMs: true,
        syncReportedBalance: true,
      },
    });

    // Drop the cached timeout so the new value takes effect immediately in this
    // process (other processes refresh within the cache TTL).
    if (dto.requestTimeoutMs !== undefined) {
      this.vendorConfig.invalidate();
    }

    if (req.auth?.sub) {
      void this.userActivityService.recordActivity({
        type: 'VENDOR_SETTINGS_UPDATED',
        actorUserId: req.auth.sub,
        vendorName: vendor.displayName,
      });
    }

    void this.eventBus.publish('sse:internal', {
      event: SseEventType.VENDOR_UPDATED,
      data: { vendorCode: code, updatedAt: new Date().toISOString() },
    });

    return {
      lowBalanceThreshold:
        updated.lowBalanceThreshold != null
          ? updated.lowBalanceThreshold.toFixed(2)
          : null,
      requestTimeoutMs: updated.requestTimeoutMs,
      syncReportedBalance: updated.syncReportedBalance,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private async findVendorOrThrow(code: VendorName) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { code, deletedAt: null },
      include: {
        capabilities: { orderBy: { priority: 'asc' } },
        balanceSnapshot: true,
      },
    });
    if (!vendor) {
      throw new NotFoundException(`Vendor ${code} not found`);
    }
    return vendor;
  }

  private async assertCanManageVendors(req: RequestWithAuth): Promise<void> {
    const viewerUserId = req.auth?.sub;
    if (!viewerUserId) {
      throw new ForbiddenException('Authenticated internal user required');
    }
    // Recriauth resolves the writer's tier from InternalTeamEmployee. Recrify
    // has a single admin tier, surfaced as SUPER_ADMIN by compat.normalizeAuth.
    const access = req.auth?.access ?? null;
    if (!access || !VENDOR_MANAGER_ROLES.includes(access)) {
      throw new ForbiddenException(
        'Only operations and super-admins can change vendor settings',
      );
    }
  }
}
