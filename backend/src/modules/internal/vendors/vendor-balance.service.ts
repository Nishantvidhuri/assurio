import { Injectable, Logger } from '@nestjs/common';
import {
  CurrencyCode,
  VendorBillingModel,
  VendorName,
} from '../../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma.service';

interface FetchedBalance {
  balance: number;
  /** 'INR' for rupee wallets, 'credits' for credit-based vendors. */
  unit: string;
  currency: CurrencyCode;
  source: string;
}

export interface BalanceSyncResult {
  vendor: VendorName;
  ok: boolean;
  balance?: number;
  error?: string;
}

// Refresh-on-view is throttled to this interval so dashboard loads don't
// hammer the vendor APIs — one sync per window is enough.
const STALE_MS = 5 * 60 * 1000;

/**
 * Fetches the live prepaid balance for each syncable vendor from its own
 * balance API and records it as a snapshot (current, shown in "Avl. Balance")
 * plus a reading (history that feeds burn-rate / runway). Tokens are read from
 * env; per-vendor failures are isolated so one vendor being down never blocks
 * the others or the dashboard.
 */
@Injectable()
export class VendorBalanceService {
  private readonly logger = new Logger(VendorBalanceService.name);
  private lastSyncAt = 0;
  private inFlight: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Full sync across every syncable prepaid vendor. Awaited (refresh endpoint). */
  async syncBalances(): Promise<BalanceSyncResult[]> {
    const vendors = await this.prisma.vendor.findMany({
      where: {
        deletedAt: null,
        billingModel: VendorBillingModel.PREPAID,
        syncReportedBalance: true,
      },
      select: { id: true, code: true },
    });

    const results: BalanceSyncResult[] = [];
    for (const vendor of vendors) {
      try {
        const fetched = await this.fetchBalance(vendor.code);
        if (!fetched) {
          results.push({
            vendor: vendor.code,
            ok: false,
            error: 'no fetcher or unparseable response',
          });
          continue;
        }
        const now = new Date();
        await this.prisma.$transaction([
          this.prisma.vendorBalanceSnapshot.upsert({
            where: { vendorId: vendor.id },
            create: {
              vendorId: vendor.id,
              reportedBalance: fetched.balance,
              reportedUnit: fetched.unit,
              reportedCurrency: fetched.currency,
              reportedAt: now,
              source: fetched.source,
            },
            update: {
              reportedBalance: fetched.balance,
              reportedUnit: fetched.unit,
              reportedCurrency: fetched.currency,
              reportedAt: now,
              source: fetched.source,
            },
          }),
          this.prisma.vendorBalanceReading.create({
            data: {
              vendorId: vendor.id,
              reportedBalance: fetched.balance,
              reportedUnit: fetched.unit,
              reportedCurrency: fetched.currency,
              source: fetched.source,
              readAt: now,
            },
          }),
        ]);
        results.push({ vendor: vendor.code, ok: true, balance: fetched.balance });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Balance sync failed for ${vendor.code}: ${message}`);
        results.push({ vendor: vendor.code, ok: false, error: message });
      }
    }
    this.lastSyncAt = Date.now();
    return results;
  }

  /**
   * Non-blocking, throttled refresh for the dashboard read path: coalesces
   * concurrent callers, skips if a sync ran within STALE_MS, and never throws.
   * The current request returns the existing snapshot; the next load is fresh.
   */
  syncIfStale(): void {
    if (this.inFlight) return;
    if (this.lastSyncAt && Date.now() - this.lastSyncAt < STALE_MS) return;
    this.inFlight = this.syncBalances()
      .then(() => undefined)
      .catch((error) => {
        this.logger.warn(
          `Background balance sync failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      })
      .finally(() => {
        this.inFlight = null;
      });
  }

  // ─── Per-vendor fetchers ───────────────────────────────────────────────

  private async fetchBalance(
    vendor: VendorName,
  ): Promise<FetchedBalance | null> {
    switch (vendor) {
      case VendorName.SUREPASS:
        return this.fetchSurepassBalance();
      case VendorName.KONNECTNXT:
        return this.fetchKonnectnxtBalance();
      default:
        return null;
    }
  }

  /** Surepass wallet: GET /api/v1/utils/usage/balance → { data: { balance } }. */
  private async fetchSurepassBalance(): Promise<FetchedBalance | null> {
    const token = process.env.SUREPASS_API_TOKEN;
    if (!token) throw new Error('SUREPASS_API_TOKEN not configured');
    const host = normalizeHost(
      process.env.SUREPASS_BASE_URL || 'https://kyc-api.surepass.app',
      '/api/v1',
    );
    const res = await fetch(`${host}/api/v1/utils/usage/balance`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Surepass balance HTTP ${res.status}`);
    const json = (await res.json().catch(() => null)) as {
      data?: { balance?: unknown };
    } | null;
    const balance = toFiniteNumber(json?.data?.balance);
    if (balance == null) return null;
    return {
      balance,
      unit: 'INR',
      currency: CurrencyCode.INR,
      source: 'surepass:utils/usage/balance',
    };
  }

  /**
   * KonnectNXT credits: GET /api/v2/credits/transactions → top-level
   * `credits_remaining`. per_page=1 keeps the transaction history (and its PII)
   * out — only the account-level remaining-credits figure is needed.
   */
  private async fetchKonnectnxtBalance(): Promise<FetchedBalance | null> {
    const token = process.env.KONNECTNXT_API_KEY;
    if (!token) throw new Error('KONNECTNXT_API_KEY not configured');
    const host = normalizeHost(
      process.env.KONNECTNXT_BASE_URL || 'https://bgv.konnectnxt.com',
      '/api/v2',
    );
    const res = await fetch(
      `${host}/api/v2/credits/transactions?page=1&per_page=1`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`KonnectNXT credits HTTP ${res.status}`);
    const json = (await res.json().catch(() => null)) as {
      credits_remaining?: unknown;
    } | null;
    const balance = toFiniteNumber(json?.credits_remaining);
    if (balance == null) return null;
    return {
      balance,
      unit: 'credits',
      currency: CurrencyCode.INR,
      source: 'konnectnxt:credits_remaining',
    };
  }
}

/**
 * Strip a trailing slash and an optional trailing version segment so the
 * canonical `/api/vN/...` path is appended exactly once, whether or not the
 * configured base URL already includes the version (env here is the bare host).
 */
function normalizeHost(base: string, versionSuffix: string): string {
  return base.replace(/\/+$/, '').replace(new RegExp(`${versionSuffix}$`), '');
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
