/**
 * Recrify compatibility layer for the ported Vendor Management module.
 *
 * The module is a 1:1 port from Recriauth. A handful of its collaborators are
 * platform services Recrify doesn't have (multi-tenant test-data visibility,
 * the SSE event bus, the internal user-activity audit trail, the internal
 * team-access tiers). Rather than dragging those subsystems in, this file
 * provides the same injectable surfaces with inert behaviour, so every query,
 * aggregation and KPI computation in the ported service is preserved verbatim.
 *
 * VendorConfigService is the real Recriauth implementation (it only needs
 * Prisma) and is kept intact.
 */
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { VendorName } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma.service';

/* ─────────────────────────────────────────────────────────────────────────
 * Request shape
 * Recrify's JwtAuthGuard puts the JWT payload on `req.user`. The ported code
 * reads `req.auth?.sub`, so the controller normalises one onto the other and
 * this interface describes the result.
 * ───────────────────────────────────────────────────────────────────────── */
export interface RequestWithAuth extends Request {
  user?: { sub?: string; email?: string; role?: string };
  auth?: { sub?: string; access?: InternalTeamAccess | null };
}

/** Copy `req.user` onto `req.auth` so ported code reads it unchanged. */
export function normalizeAuth(req: RequestWithAuth): RequestWithAuth {
  req.auth = {
    sub: req.user?.sub,
    // Recrify has a single admin tier; treat every admin as SUPER_ADMIN so the
    // ported write-permission check (VENDOR_MANAGER_ROLES) passes for admins.
    access:
      req.user?.role === 'admin' ? InternalTeamAccess.SUPER_ADMIN : null,
  };
  return req;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Internal team access tiers (Recriauth Prisma enum, mirrored as a const)
 * ───────────────────────────────────────────────────────────────────────── */
export const InternalTeamAccess = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  OPERATIONS: 'OPERATIONS',
  SUPPORT: 'SUPPORT',
  VERIFIER: 'VERIFIER',
} as const;
export type InternalTeamAccess =
  (typeof InternalTeamAccess)[keyof typeof InternalTeamAccess];

/* ─────────────────────────────────────────────────────────────────────────
 * Test-data visibility — Recriauth hides seeded test tenants from internal
 * dashboards. Recrify has no test-tenant concept, so nothing is hidden.
 * ───────────────────────────────────────────────────────────────────────── */
@Injectable()
export class TestDataVisibilityService {
  async shouldHideTestData(_userId?: string): Promise<boolean> {
    return false;
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * SSE event bus — Recrify broadcasts via EventsService on its own channels;
 * vendor-settings pushes are not wired up, so this is a no-op sink.
 * ───────────────────────────────────────────────────────────────────────── */
export const SseEventType = {
  VENDOR_UPDATED: 'VENDOR_UPDATED',
} as const;
export type SseEventType = (typeof SseEventType)[keyof typeof SseEventType];

@Injectable()
export class EventBusService {
  async publish(_channel: string, _payload: unknown): Promise<void> {
    /* no-op */
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Internal user-activity trail — Recriauth records admin actions for its
 * audit log. Recrify has no equivalent surface yet.
 * ───────────────────────────────────────────────────────────────────────── */
@Injectable()
export class InternalUserActivityService {
  async recordActivity(_entry: Record<string, unknown>): Promise<void> {
    /* no-op */
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * VendorConfigService — real Recriauth implementation (Prisma-only).
 * ───────────────────────────────────────────────────────────────────────── */
const CACHE_TTL_MS = 30_000;

@Injectable()
export class VendorConfigService {
  private cache = new Map<VendorName, number | null>();
  private loadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async getRequestTimeoutMs(
    vendor: VendorName,
    fallbackMs: number,
  ): Promise<number> {
    await this.ensureCache();
    const configured = this.cache.get(vendor);
    return configured != null && configured > 0 ? configured : fallbackMs;
  }

  invalidate(): void {
    this.loadedAt = 0;
  }

  private async ensureCache(): Promise<void> {
    if (this.loadedAt && Date.now() - this.loadedAt < CACHE_TTL_MS) {
      return;
    }
    const rows = await this.prisma.vendor.findMany({
      where: { deletedAt: null },
      select: { code: true, requestTimeoutMs: true },
    });
    this.cache = new Map(rows.map((row) => [row.code, row.requestTimeoutMs]));
    this.loadedAt = Date.now();
  }
}
