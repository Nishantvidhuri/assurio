import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VendorName } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma.service';
import {
  ListVendorCallsQueryDto,
  type HttpClass,
} from './dto/list-vendor-calls-query.dto';
import { maskSecrets } from './mask-secrets.util';
import {
  dayBuckets,
  resolveRange,
  startOfMonthUtc,
  trendPct,
  type ResolvedRange,
} from './vendor-analytics.util';

export interface VendorCallStats {
  calls: number;
  success: number;
  failed: number;
  /**
   * Failures that reflect the vendor itself — network/no-response and 5xx —
   * excluding 4xx input-validation rejections (e.g. "no Aadhaar located"),
   * which mean the vendor worked correctly on a bad input. Drives the
   * elevated-error-rate alert so those rejections don't count against health.
   */
  serverFailed: number;
  /** 0–100, rounded to 1dp. null when there were no calls in the window. */
  successRate: number | null;
}

const HTTP_CLASS_RANGE: Record<HttpClass, { gte: number; lt: number }> = {
  '2xx': { gte: 200, lt: 300 },
  '3xx': { gte: 300, lt: 400 },
  '4xx': { gte: 400, lt: 500 },
  '5xx': { gte: 500, lt: 600 },
};

// Excludes vendor API calls attributable to a test-data client from cost/
// health metrics. Rows with a NULL tenant (e.g. pre-org onboarding GSTIN
// lookups) are always kept, so legitimate non-tenant spend is never dropped.
// Gated on `excludeTestData` (the caller resolves the super-admin "hide test
// data" preference) so vendor analytics honours the toggle like every other
// surface — pass `false` to include test data.
function excludeTestTenantSql(excludeTestData: boolean): Prisma.Sql {
  return excludeTestData
    ? Prisma.sql`
      AND ("tenantId" IS NULL OR "tenantId" NOT IN (
        SELECT o.id FROM "Organization" o WHERE o."isTestData" = TRUE
      ))`
    : Prisma.empty;
}
// Same predicate for raw queries that alias VendorApiCallAudit as `a`.
function excludeTestTenantSqlA(excludeTestData: boolean): Prisma.Sql {
  return excludeTestData
    ? Prisma.sql`
      AND (a."tenantId" IS NULL OR a."tenantId" NOT IN (
        SELECT o.id FROM "Organization" o WHERE o."isTestData" = TRUE
      ))`
    : Prisma.empty;
}
// Prisma where fragment for .aggregate / .groupBy / .count / .findMany.
function excludeTestTenantWhere(
  excludeTestData: boolean,
): Prisma.VendorApiCallAuditWhereInput {
  // Assurio has no test-tenant concept (no Organization model), so nothing
  // is excluded — see compat.TestDataVisibilityService.
  void excludeTestData;
  return {};
}

/**
 * Read-only data layer over VendorApiCallAudit: the global call log, per-call
 * detail (with request secrets masked), and the aggregate metrics powering the
 * overview KPIs / expenses trend and the per-vendor health charts. All cost is
 * out of scope here (a later slice) — these are pure observability reads.
 */
@Injectable()
export class InternalVendorCallsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Global API call log ────────────────────────────────────────────

  async listCalls(query: ListVendorCallsQueryDto, excludeTestData: boolean) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where = await this.buildCallsWhere(query, excludeTestData);
    const nameMap = await this.vendorNameMap();

    const [rows, totalItems] = await Promise.all([
      this.prisma.vendorApiCallAudit.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: pageSize,
        select: {
          id: true,
          vendor: true,
          endpoint: true,
          httpMethod: true,
          httpStatusCode: true,
          durationMs: true,
          success: true,
          errorMessage: true,
          requestId: true,
          attemptNumber: true,
          maxAttempts: true,
          createdAt: true,
          candidateCaseId: true,
        },
      }),
      this.prisma.vendorApiCallAudit.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        vendorCode: row.vendor,
        vendorName: nameMap.get(row.vendor) ?? row.vendor,
        createdAt: row.createdAt.toISOString(),
        httpMethod: row.httpMethod,
        endpoint: row.endpoint,
        httpStatusCode: row.httpStatusCode,
        durationMs: row.durationMs,
        success: row.success,
        whyFailed: row.success
          ? null
          : describeFailureReason(row.httpStatusCode, row.errorMessage),
        description: describeCall(
          row.success,
          row.httpStatusCode,
          row.errorMessage,
        ),
        retryStatus:
          row.attemptNumber != null && row.maxAttempts != null
            ? `${row.attemptNumber}/${row.maxAttempts}`
            : null,
        caseReference: null, // no CandidateCase model in Assurio
        candidateCaseId: row.candidateCaseId,
        requestId: row.requestId,
      })),
      meta: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      },
    };
  }

  async getCall(id: string) {
    const row = await this.prisma.vendorApiCallAudit.findUnique({
      where: { id },
      select: {
        id: true,
        vendor: true,
        endpoint: true,
        httpMethod: true,
        httpStatusCode: true,
        durationMs: true,
        success: true,
        errorMessage: true,
        requestId: true,
        requestPayload: true,
        responseBody: true,
        createdAt: true,
        candidateCaseId: true,
        candidateCaseCheckId: true,
        vendorVerificationId: true,
      },
    });

    if (!row) {
      throw new NotFoundException('Vendor API call not found');
    }

    const nameMap = await this.vendorNameMap();

    return {
      id: row.id,
      vendorCode: row.vendor,
      vendorName: nameMap.get(row.vendor) ?? row.vendor,
      endpoint: row.endpoint,
      httpMethod: row.httpMethod,
      httpStatusCode: row.httpStatusCode,
      durationMs: row.durationMs,
      success: row.success,
      errorMessage: row.errorMessage,
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString(),
      whyFailed: row.success
        ? null
        : describeFailureReason(row.httpStatusCode, row.errorMessage),
      description: describeCall(
        row.success,
        row.httpStatusCode,
        row.errorMessage,
      ),
      // Case/check/verification enrichment is Recriauth-only (those models
      // don't exist in Assurio); the response keys are preserved as null.
      caseReference: null,
      checkName: null,
      verificationType: null,
      verificationStatus: null,
      // Secrets masked; raw vendor response returned verbatim for debugging.
      requestPayload: maskSecrets(row.requestPayload),
      responseBody: row.responseBody ?? null,
    };
  }

  private async buildCallsWhere(
    query: ListVendorCallsQueryDto,
    excludeTestData: boolean,
  ): Promise<Prisma.VendorApiCallAuditWhereInput> {
    const where: Prisma.VendorApiCallAuditWhereInput = {};
    const and: Prisma.VendorApiCallAuditWhereInput[] = [];

    if (query.vendor && query.vendor.length > 0) {
      where.vendor = { in: query.vendor };
    }
    if (query.method && query.method.length > 0) {
      where.httpMethod = {
        in: query.method.map((method) => method.toUpperCase()),
      };
    }
    if (query.outcome) {
      where.success = query.outcome === 'success';
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(query.to) } : {}),
      };
    }
    if (query.httpClass && query.httpClass.length > 0) {
      and.push({
        OR: query.httpClass.map((httpClass) => ({
          httpStatusCode: HTTP_CLASS_RANGE[httpClass],
        })),
      });
    }
    if (query.endpoint && query.endpoint.length > 0) {
      const ors: Prisma.VendorApiCallAuditWhereInput[] = [];
      for (const value of query.endpoint) {
        // A single curated option may bundle several endpoints (e.g. "TeleCMI",
        // "OCR (In-house)") as a `|`-separated token list.
        for (const token of value.split('|')) {
          if (!token) continue;
          if (token.endsWith('*')) {
            // Prefix match, e.g. '/digilocker/status/*' → '/digilocker/status/<id>',
            // '/ocr/*' → all Surepass OCR. The kept trailing slash on '/pan/*'
            // stops it from swallowing the in-house OCR leaf '/pan'.
            ors.push({ endpoint: { startsWith: token.slice(0, -1) } });
          } else {
            // Exact path, tolerating a trailing slash and any query string.
            ors.push({ endpoint: token });
            ors.push({ endpoint: `${token}/` });
            ors.push({ endpoint: { startsWith: `${token}?` } });
          }
        }
      }
      and.push({ OR: ors });
    }
    if (query.capability && query.capability.length > 0) {
      const verificationTypes = await this.resolveCapabilityVerificationTypes(
        query.capability,
      );
      if (verificationTypes.length > 0) {
        // Recriauth filters through the VendorVerification join; without that
        // model the capability filter cannot match any audit row.
        where.id = '__no_match__';
      } else {
        // Selected capabilities have no enum-backed verification type to match
        // (e.g. GST / telephony) — no audit rows can satisfy the filter.
        where.id = '__no_match__';
      }
    }

    const term = query.search?.trim();
    if (term) {
      and.push({
        OR: [
          { requestId: { contains: term, mode: 'insensitive' } },
          { endpoint: { contains: term, mode: 'insensitive' } },
        ],
      });
    }

    // Hide vendor calls made on behalf of test-data clients (null-tenant rows
    // are kept) unless the viewer opted to see test data. Pushed onto AND so it
    // composes with the OR-based filters above.
    if (excludeTestData) {
      and.push(excludeTestTenantWhere(true));
    }

    if (and.length > 0) {
      where.AND = and;
    }
    return where;
  }

  private async resolveCapabilityVerificationTypes(codes: string[]) {
    const capabilities = await this.prisma.vendorCapability.findMany({
      where: { code: { in: codes }, verificationType: { not: null } },
      select: { verificationType: true },
    });
    return [
      ...new Set(
        capabilities
          .map((capability) => capability.verificationType)
          .filter((type): type is NonNullable<typeof type> => type !== null),
      ),
    ];
  }

  // ─── Aggregate metrics ──────────────────────────────────────────────

  /** Total billable-or-not call count in [from, to). */
  countCalls(from: Date, to: Date, excludeTestData: boolean): Promise<number> {
    return this.prisma.vendorApiCallAudit.count({
      where: {
        createdAt: { gte: from, lt: to },
        ...excludeTestTenantWhere(excludeTestData),
      },
    });
  }

  /** Per-vendor success/fail tallies over a window, keyed by VendorName. */
  async perVendorStats(
    from: Date,
    to: Date,
    excludeTestData: boolean,
  ): Promise<Map<VendorName, VendorCallStats>> {
    // `serverFailed` counts only failures attributable to the vendor
    // (network/no-response + 5xx), excluding 4xx input-validation rejections.
    const rows = await this.prisma.$queryRaw<
      Array<{
        vendor: VendorName;
        calls: bigint;
        success: bigint;
        failed: bigint;
        server_failed: bigint;
      }>
    >(Prisma.sql`
      SELECT vendor,
             COUNT(*)::bigint AS calls,
             COUNT(*) FILTER (WHERE success)::bigint AS success,
             COUNT(*) FILTER (WHERE NOT success)::bigint AS failed,
             COUNT(*) FILTER (
               WHERE NOT success
               AND ("httpStatusCode" IS NULL OR "httpStatusCode" NOT BETWEEN 400 AND 499)
             )::bigint AS server_failed
      FROM "VendorApiCallAudit"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      ${excludeTestTenantSql(excludeTestData)}
      GROUP BY vendor
    `);

    const map = new Map<VendorName, VendorCallStats>();
    for (const row of rows) {
      const calls = Number(row.calls);
      const success = Number(row.success);
      map.set(row.vendor, {
        calls,
        success,
        failed: Number(row.failed),
        serverFailed: Number(row.server_failed),
        successRate:
          calls === 0 ? null : Math.round((success / calls) * 1000) / 10,
      });
    }
    return map;
  }

  /** Per-vendor daily call counts for the overview "expenses" trend chart. */
  async expensesSeries(range: ResolvedRange, excludeTestData: boolean) {
    const rows = await this.prisma.$queryRaw<
      Array<{ vendor: VendorName; day: Date; calls: number }>
    >(Prisma.sql`
      SELECT a.vendor AS vendor,
             date_trunc('day', a."createdAt") AS day,
             COUNT(*)::int AS calls
      FROM "VendorApiCallAudit" a
      WHERE a."createdAt" >= ${range.from} AND a."createdAt" < ${range.to}
      ${excludeTestTenantSqlA(excludeTestData)}
      GROUP BY a.vendor, day
      ORDER BY day ASC
    `);

    const buckets = dayBuckets(range.from, range.to);
    const bucketIndex = new Map(buckets.map((day, index) => [day, index]));
    const byVendor = new Map<VendorName, number[]>();
    for (const row of rows) {
      const series =
        byVendor.get(row.vendor) ?? new Array<number>(buckets.length).fill(0);
      const index = bucketIndex.get(row.day.toISOString().slice(0, 10));
      if (index !== undefined) {
        series[index] = row.calls;
      }
      byVendor.set(row.vendor, series);
    }
    return { buckets, byVendor };
  }

  /** Daily health buckets + an overall summary for a single vendor. */
  async vendorHealth(
    vendor: VendorName,
    range: ResolvedRange,
    excludeTestData: boolean,
  ) {
    const daily = await this.prisma.$queryRaw<
      Array<{
        day: Date;
        total: number;
        success: number;
        failed: number;
        p50: number | null;
        p95: number | null;
      }>
    >(Prisma.sql`
      SELECT date_trunc('day', "createdAt") AS day,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE success)::int AS success,
             COUNT(*) FILTER (WHERE NOT success)::int AS failed,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs") AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY "durationMs") AS p95
      FROM "VendorApiCallAudit"
      WHERE vendor = ${vendor}::"VendorName"
        AND "createdAt" >= ${range.from} AND "createdAt" < ${range.to}
        ${excludeTestTenantSql(excludeTestData)}
      GROUP BY day
      ORDER BY day ASC
    `);

    const buckets = dayBuckets(range.from, range.to);
    const byDay = new Map(
      daily.map((row) => [row.day.toISOString().slice(0, 10), row]),
    );
    const points = buckets.map((day) => {
      const row = byDay.get(day);
      const total = row?.total ?? 0;
      const success = row?.success ?? 0;
      return {
        date: day,
        total,
        success,
        failed: row?.failed ?? 0,
        p50LatencyMs: row?.p50 != null ? Math.round(Number(row.p50)) : null,
        p95LatencyMs: row?.p95 != null ? Math.round(Number(row.p95)) : null,
        uptimePct:
          total === 0 ? null : Math.round((success / total) * 1000) / 10,
      };
    });

    // Prior equal-length window drives the period-over-period delta badges on
    // the three health-chart headers (Total calls / Latency / Uptime).
    const previousRange = {
      ...range,
      from: range.previousFrom,
      to: range.previousTo,
    };
    const [summary, summaryPrevious] = await Promise.all([
      this.vendorSummary(vendor, range, excludeTestData),
      this.vendorSummary(vendor, previousRange, excludeTestData),
    ]);

    return {
      buckets,
      points,
      summary,
      summaryPrevious,
    };
  }

  /** Headline totals for the detail KPI cards + health card headers. */
  async vendorSummary(
    vendor: VendorName,
    range: ResolvedRange,
    excludeTestData: boolean,
  ) {
    const [row] = await this.prisma.$queryRaw<
      Array<{
        total: number;
        success: number;
        avg: number | null;
        p95: number | null;
      }>
    >(Prisma.sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE success)::int AS success,
             AVG("durationMs")::float AS avg,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY "durationMs") AS p95
      FROM "VendorApiCallAudit"
      WHERE vendor = ${vendor}::"VendorName"
        AND "createdAt" >= ${range.from} AND "createdAt" < ${range.to}
        ${excludeTestTenantSql(excludeTestData)}
    `);

    const total = row?.total ?? 0;
    const success = row?.success ?? 0;
    return {
      totalCalls: total,
      success,
      failed: total - success,
      successRatePct:
        total === 0 ? null : Math.round((success / total) * 1000) / 10,
      uptimePct: total === 0 ? null : Math.round((success / total) * 1000) / 10,
      avgLatencyMs: row?.avg != null ? Math.round(Number(row.avg)) : null,
      p95LatencyMs: row?.p95 != null ? Math.round(Number(row.p95)) : null,
    };
  }

  /**
   * Month-to-date call counts per verification type for a vendor.
   *
   * Assurio has no VendorVerification link table (Recriauth-only) and
   * VendorApiCallAudit carries no verificationType column, so counts are
   * derived from the recorded endpoints via the vendor's cost-rate card, which
   * maps each endpoint prefix to a verificationType (longest prefix wins).
   */
  async perVerificationTypeMtd(
    vendor: VendorName,
    excludeTestData: boolean,
  ): Promise<Map<string, number>> {
    const [endpointCounts, rates] = await Promise.all([
      this.prisma.vendorApiCallAudit.groupBy({
        by: ['endpoint'],
        where: {
          vendor,
          createdAt: { gte: startOfMonthUtc() },
          ...excludeTestTenantWhere(excludeTestData),
        },
        _count: { _all: true },
      }),
      this.prisma.vendorCostRate.findMany({
        where: { vendor: { code: vendor }, verificationType: { not: null } },
        select: { endpointPrefix: true, verificationType: true },
      }),
    ]);

    // Longest endpoint prefix wins so a specific path beats a broad one.
    const prefixes = rates
      .filter((rate) => rate.endpointPrefix.startsWith('/'))
      .sort((a, b) => b.endpointPrefix.length - a.endpointPrefix.length);

    const counts = new Map<string, number>();
    for (const row of endpointCounts) {
      const match = prefixes.find((rate) =>
        row.endpoint.startsWith(rate.endpointPrefix),
      );
      if (match?.verificationType) {
        counts.set(
          match.verificationType,
          (counts.get(match.verificationType) ?? 0) + row._count._all,
        );
      }
    }
    return counts;
  }

  /** Month-to-date call counts per exact endpoint for a vendor — powers
   *  per-capability call counts for endpoint-keyed capabilities (OCR, GST). */
  async perEndpointMtd(
    vendor: VendorName,
    excludeTestData: boolean,
  ): Promise<Map<string, number>> {
    const grouped = await this.prisma.vendorApiCallAudit.groupBy({
      by: ['endpoint'],
      where: {
        vendor,
        createdAt: { gte: startOfMonthUtc() },
        ...excludeTestTenantWhere(excludeTestData),
      },
      _count: { _all: true },
    });
    return new Map(grouped.map((row) => [row.endpoint, row._count._all]));
  }

  /** Most recent calls for a vendor — the detail page's mini API-logs panel. */
  async recentCalls(vendor: VendorName, excludeTestData: boolean, limit = 8) {
    const rows = await this.prisma.vendorApiCallAudit.findMany({
      where: { vendor, ...excludeTestTenantWhere(excludeTestData) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        endpoint: true,
        httpStatusCode: true,
        success: true,
        createdAt: true,
        vendorVerificationId: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      endpoint: row.endpoint,
      httpStatusCode: row.httpStatusCode,
      success: row.success,
      createdAt: row.createdAt.toISOString(),
      verificationType: null, // no VendorVerification model in Assurio
    }));
  }

  // ─── Spend aggregates (over stamped costAmount) ─────────────────────

  /** Total per-call spend (₹) in [from, to). Excludes subscription cost. */
  totalSpend(from: Date, to: Date, excludeTestData: boolean): Promise<number> {
    return this.prisma.vendorApiCallAudit
      .aggregate({
        _sum: { costAmount: true },
        where: {
          createdAt: { gte: from, lt: to },
          ...excludeTestTenantWhere(excludeTestData),
        },
      })
      .then((result) => Number(result._sum.costAmount ?? 0));
  }

  /** Per-call spend (₹) for one vendor in [from, to). */
  vendorSpend(
    vendor: VendorName,
    from: Date,
    to: Date,
    excludeTestData: boolean,
  ): Promise<number> {
    return this.prisma.vendorApiCallAudit
      .aggregate({
        _sum: { costAmount: true },
        where: {
          vendor,
          createdAt: { gte: from, lt: to },
          ...excludeTestTenantWhere(excludeTestData),
        },
      })
      .then((result) => Number(result._sum.costAmount ?? 0));
  }

  /** Most recent failed-call time per vendor in a window (for alert timestamps). */
  async lastFailureAtByVendor(
    from: Date,
    to: Date,
    excludeTestData: boolean,
  ): Promise<Map<VendorName, Date>> {
    const grouped = await this.prisma.vendorApiCallAudit.groupBy({
      by: ['vendor'],
      where: {
        success: false,
        createdAt: { gte: from, lt: to },
        ...excludeTestTenantWhere(excludeTestData),
      },
      _max: { createdAt: true },
    });
    const map = new Map<VendorName, Date>();
    for (const row of grouped) {
      if (row._max.createdAt) {
        map.set(row.vendor, row._max.createdAt);
      }
    }
    return map;
  }

  /** Per-vendor per-call spend (₹) over a window, keyed by VendorName. */
  async spendByVendor(
    from: Date,
    to: Date,
    excludeTestData: boolean,
  ): Promise<Map<VendorName, number>> {
    const grouped = await this.prisma.vendorApiCallAudit.groupBy({
      by: ['vendor'],
      where: {
        createdAt: { gte: from, lt: to },
        ...excludeTestTenantWhere(excludeTestData),
      },
      _sum: { costAmount: true },
    });
    return new Map(
      grouped.map((row) => [row.vendor, Number(row._sum.costAmount ?? 0)]),
    );
  }

  /** Per-vendor daily spend (₹) for the overview expenses chart. */
  async spendSeries(range: ResolvedRange, excludeTestData: boolean) {
    const rows = await this.prisma.$queryRaw<
      Array<{ vendor: VendorName; day: Date; spend: number }>
    >(Prisma.sql`
      SELECT a.vendor AS vendor,
             date_trunc('day', a."createdAt") AS day,
             COALESCE(SUM(a."costAmount"), 0)::float AS spend
      FROM "VendorApiCallAudit" a
      WHERE a."createdAt" >= ${range.from} AND a."createdAt" < ${range.to}
      ${excludeTestTenantSqlA(excludeTestData)}
      GROUP BY a.vendor, day
      ORDER BY day ASC
    `);

    const buckets = dayBuckets(range.from, range.to);
    const bucketIndex = new Map(buckets.map((day, index) => [day, index]));
    const byVendor = new Map<VendorName, number[]>();
    for (const row of rows) {
      const series =
        byVendor.get(row.vendor) ?? new Array<number>(buckets.length).fill(0);
      const index = bucketIndex.get(row.day.toISOString().slice(0, 10));
      if (index !== undefined) {
        series[index] = Math.round(row.spend * 100) / 100;
      }
      byVendor.set(row.vendor, series);
    }
    return { buckets, byVendor };
  }

  /** Resolves the analytics window (shared with the registry service). */
  resolveRange = resolveRange;
  trendPct = trendPct;

  private async vendorNameMap(): Promise<Map<VendorName, string>> {
    const vendors = await this.prisma.vendor.findMany({
      select: { code: true, displayName: true },
    });
    return new Map(vendors.map((vendor) => [vendor.code, vendor.displayName]));
  }
}

// ─── Description helpers ──────────────────────────────────────────────────

function describeCall(
  success: boolean,
  status: number | null,
  errorMessage: string | null,
): string {
  if (success) {
    return status === 202
      ? 'Request accepted for processing'
      : 'Request completed successfully';
  }
  const reason = (errorMessage ?? '').toLowerCase();
  if (reason.includes('timeout') || reason.includes('timed out')) {
    return 'Vendor did not respond within timeout';
  }
  if (status != null && status >= 500) {
    return 'Vendor service unavailable';
  }
  return errorMessage?.trim() || 'Request failed';
}

function describeFailureReason(
  status: number | null,
  errorMessage: string | null,
): string {
  const reason = (errorMessage ?? '').toLowerCase();
  if (reason.includes('timeout') || reason.includes('timed out')) {
    return 'Request Timeout';
  }
  if (
    (status != null && status >= 500) ||
    reason.includes('upstream') ||
    reason.includes('unavailable')
  ) {
    return 'Upstream Unavailable';
  }
  return errorMessage?.trim() || 'Unknown error';
}
