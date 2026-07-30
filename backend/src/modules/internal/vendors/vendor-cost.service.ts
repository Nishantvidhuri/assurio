import { Injectable } from '@nestjs/common';
import {
  CurrencyCode,
  VendorCostSource,
  VendorName,
  VendorVerificationType,
} from '../../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma.service';

export interface ResolvedCallCost {
  billable: boolean;
  costAmount: number | null;
  costCurrency: CurrencyCode | null;
  costSource: VendorCostSource;
}

interface RateEntry {
  endpointPrefix: string;
  verificationType: VendorVerificationType | null;
  unitCost: number;
  currencyCode: CurrencyCode;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const NON_BILLABLE: ResolvedCallCost = {
  billable: false,
  costAmount: 0,
  costCurrency: CurrencyCode.INR,
  costSource: VendorCostSource.NONE,
};

/**
 * Resolves the buy-side cost of a vendor API call from the effective-dated
 * VendorCostRate catalog (cached). Cost is keyed by longest-matching endpoint
 * prefix; KonnectNXT bundled checks are read from the vendor response; TeleCMI
 * (subscription) and in-house OCR (internal) carry no per-call charge.
 *
 * Pure read/resolve — no writes — so it's safe in both the API process
 * (per-capability cost display) and the worker (the cost sweep).
 */
@Injectable()
export class VendorCostService {
  private cache = new Map<VendorName, RateEntry[]>();
  private cacheLoadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async resolveCallCost(
    vendor: VendorName,
    endpoint: string,
    callAt: Date,
    responseBody: unknown,
  ): Promise<ResolvedCallCost> {
    // Flat subscription / internal service — never a per-call charge.
    if (vendor === VendorName.TELECMI || vendor === VendorName.IN_HOUSE_OCR) {
      return {
        billable: false,
        costAmount: 0,
        costCurrency: CurrencyCode.INR,
        costSource: VendorCostSource.INTERNAL,
      };
    }

    const path = normalizePath(endpoint);

    // KonnectNXT bundles checks in one bgv-submit call; the response is
    // authoritative for the actual cost.
    if (vendor === VendorName.KONNECTNXT && path.includes('bgv-submit')) {
      const amount = parseKonnectCost(responseBody);
      if (amount != null) {
        return {
          billable: true,
          costAmount: amount,
          costCurrency: CurrencyCode.INR,
          costSource: VendorCostSource.VENDOR_RESPONSE,
        };
      }
      return NON_BILLABLE;
    }

    await this.ensureCache();
    const rates = (this.cache.get(vendor) ?? []).filter(
      (rate) =>
        rate.endpointPrefix.startsWith('/') &&
        path.startsWith(rate.endpointPrefix) &&
        rate.effectiveFrom <= callAt &&
        (rate.effectiveTo === null || rate.effectiveTo > callAt),
    );
    if (rates.length === 0) {
      return NON_BILLABLE;
    }
    // Longest prefix wins; tie-break on the most recently effective rate.
    rates.sort(
      (a, b) =>
        b.endpointPrefix.length - a.endpointPrefix.length ||
        b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
    );
    const rate = rates[0];
    return {
      billable: true,
      costAmount: rate.unitCost,
      costCurrency: rate.currencyCode,
      costSource: VendorCostSource.RATE_CARD,
    };
  }

  /** Latest effective per-call rate for a capability's verification type. */
  async getCapabilityUnitCost(
    vendor: VendorName,
    verificationType: VendorVerificationType,
    at: Date = new Date(),
  ): Promise<{ unitCost: number; currencyCode: CurrencyCode } | null> {
    await this.ensureCache();
    const rates = (this.cache.get(vendor) ?? [])
      .filter(
        (rate) =>
          rate.verificationType === verificationType &&
          rate.effectiveFrom <= at &&
          (rate.effectiveTo === null || rate.effectiveTo > at),
      )
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
    if (rates.length === 0) return null;
    return { unitCost: rates[0].unitCost, currencyCode: rates[0].currencyCode };
  }

  /**
   * Latest effective per-call rate keyed by endpoint prefix — for capabilities
   * without an enum verification type (e.g. GST lookup).
   */
  async getRateByEndpointPrefix(
    vendor: VendorName,
    endpointPrefix: string,
    at: Date = new Date(),
  ): Promise<{ unitCost: number; currencyCode: CurrencyCode } | null> {
    await this.ensureCache();
    const rates = (this.cache.get(vendor) ?? [])
      .filter(
        (rate) =>
          rate.endpointPrefix === endpointPrefix &&
          rate.effectiveFrom <= at &&
          (rate.effectiveTo === null || rate.effectiveTo > at),
      )
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
    if (rates.length === 0) return null;
    return { unitCost: rates[0].unitCost, currencyCode: rates[0].currencyCode };
  }

  invalidateCache(): void {
    this.cacheLoadedAt = 0;
  }

  private async ensureCache(): Promise<void> {
    if (this.cacheLoadedAt && Date.now() - this.cacheLoadedAt < CACHE_TTL_MS) {
      return;
    }
    const rows = await this.prisma.vendorCostRate.findMany({
      include: { vendor: { select: { code: true } } },
    });
    const next = new Map<VendorName, RateEntry[]>();
    for (const row of rows) {
      const entries = next.get(row.vendor.code) ?? [];
      entries.push({
        endpointPrefix: row.endpointPrefix,
        verificationType: row.verificationType,
        unitCost: Number(row.unitCost),
        currencyCode: row.currencyCode,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
      });
      next.set(row.vendor.code, entries);
    }
    this.cache = next;
    this.cacheLoadedAt = Date.now();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function normalizePath(endpoint: string): string {
  const queryIndex = endpoint.indexOf('?');
  return queryIndex === -1 ? endpoint : endpoint.slice(0, queryIndex);
}

function parseKonnectCost(responseBody: unknown): number | null {
  return parseNumberField(responseBody, ['total_cost', 'credits_used']);
}

/** Reads the first finite numeric value for any of `keys`, top-level or `.data`. */
function parseNumberField(body: unknown, keys: string[]): number | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const data =
    record.data && typeof record.data === 'object'
      ? (record.data as Record<string, unknown>)
      : undefined;
  for (const source of [record, data]) {
    if (!source) continue;
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return null;
}
