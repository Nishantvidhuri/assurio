import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/**
 * Packages are the single source of truth for the bill amount. Discount codes
 * apply a percentage off at checkout. Both are managed from the admin Packages
 * page; checkout reads the default package's price from here.
 */
@Injectable()
export class PackagesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  /** Seed a default package once, so checkout always has a price to read. */
  async onModuleInit(): Promise<void> {
    const count = await this.prisma.package.count();
    if (count === 0) {
      await this.prisma.package.create({
        data: {
          name: 'Standard verification',
          priceInr: 399,
          description:
            'All checks in one — PAN, Aadhaar, Driving licence, Voter ID, Passport, Employment (UAN), Credit & Court/crime',
          active: true,
          isDefault: true,
        },
      });
    }
  }

  /* ── Packages ── */

  listPackages() {
    return this.prisma.package.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  listActivePackages() {
    return this.prisma.package.findMany({
      where: { active: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async defaultPackage() {
    return (
      (await this.prisma.package.findFirst({
        where: { isDefault: true, active: true },
      })) ??
      (await this.prisma.package.findFirst({
        where: { active: true },
        orderBy: { createdAt: 'asc' },
      }))
    );
  }

  async createPackage(data: {
    name: string;
    priceInr: number;
    description?: string;
    active?: boolean;
    isDefault?: boolean;
  }) {
    if (data.isDefault) {
      await this.prisma.package.updateMany({ data: { isDefault: false } });
    }
    return this.prisma.package.create({
      data: {
        name: (data.name || '').trim() || 'Untitled package',
        priceInr: Number(data.priceInr) || 0,
        description: data.description?.trim() || null,
        active: data.active ?? true,
        isDefault: data.isDefault ?? false,
      },
    });
  }

  async updatePackage(
    id: string,
    data: {
      name?: string;
      priceInr?: number;
      description?: string;
      active?: boolean;
      isDefault?: boolean;
    },
  ) {
    if (data.isDefault) {
      await this.prisma.package.updateMany({
        where: { id: { not: id } },
        data: { isDefault: false },
      });
    }
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.priceInr !== undefined) patch.priceInr = Number(data.priceInr) || 0;
    if (data.description !== undefined)
      patch.description = data.description.trim() || null;
    if (data.active !== undefined) patch.active = data.active;
    if (data.isDefault !== undefined) patch.isDefault = data.isDefault;
    return this.prisma.package.update({ where: { id }, data: patch });
  }

  deletePackage(id: string) {
    return this.prisma.package.delete({ where: { id } });
  }

  /* ── Discount codes ── */

  listDiscounts() {
    return this.prisma.discountCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  createDiscount(data: { code: string; percentOff: number; active?: boolean }) {
    return this.prisma.discountCode.create({
      data: {
        code: (data.code || '').trim().toUpperCase(),
        percentOff: clampPercent(data.percentOff),
        active: data.active ?? true,
      },
    });
  }

  updateDiscount(
    id: string,
    data: { code?: string; percentOff?: number; active?: boolean },
  ) {
    const patch: Record<string, unknown> = {};
    if (data.code !== undefined) patch.code = data.code.trim().toUpperCase();
    if (data.percentOff !== undefined)
      patch.percentOff = clampPercent(data.percentOff);
    if (data.active !== undefined) patch.active = data.active;
    return this.prisma.discountCode.update({ where: { id }, data: patch });
  }

  deleteDiscount(id: string) {
    return this.prisma.discountCode.delete({ where: { id } });
  }

  /** Validate a discount code at checkout. Returns the % off (0 if invalid). */
  async validateDiscount(
    code: string,
  ): Promise<{ valid: boolean; percentOff: number; code: string }> {
    const c = (code || '').trim().toUpperCase();
    if (!c) return { valid: false, percentOff: 0, code: c };
    const d = await this.prisma.discountCode.findUnique({ where: { code: c } });
    if (!d || !d.active) return { valid: false, percentOff: 0, code: c };
    return { valid: true, percentOff: d.percentOff, code: c };
  }
}

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
}
