import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { Invoice } from '../../generated/prisma/client';

/**
 * Per-client invoice ledger (modelled on Recriauth's internal client invoices,
 * read-only). Our billing is pay-first: the client pays (Razorpay) and the
 * invoice is generated instantly, so this only lists + reads those invoices —
 * there is no operator create / mark-paid / void lifecycle.
 */

export type BusinessStatus = 'DUE' | 'PAID' | 'VOID';

export interface ListFilters {
  businessStatus?: BusinessStatus;
  search?: string;
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  pageSize?: number;
}

function invoiceRow(inv: Invoice) {
  return {
    id: inv.id,
    documentType: 'TAX_INVOICE' as const,
    documentNumber: inv.invoiceNumber,
    status:
      inv.status === 'paid' ? ('COMPLETED' as const) : ('PENDING' as const),
    kind: inv.kind,
    businessStatus: inv.businessStatus,
    paymentMethod: inv.paymentMethod,
    paymentTerms: inv.paymentTerms,
    credits: inv.credits,
    subtotalAmount: inv.subtotal.toFixed(2),
    taxAmount: inv.tax.toFixed(2),
    totalAmount: inv.total.toFixed(2),
    currencyCode: inv.currency,
    documentDate: (inv.paidAt ?? inv.createdAt).toISOString(),
    createdAt: inv.createdAt.toISOString(),
    dueAt: inv.dueAt ? inv.dueAt.toISOString() : null,
    markedPaidAt: inv.markedPaidAt ? inv.markedPaidAt.toISOString() : null,
    voidedAt: inv.voidedAt ? inv.voidedAt.toISOString() : null,
    billingPeriodKey: inv.billingPeriodKey,
    initiatedBy: inv.initiatedById
      ? {
          id: inv.initiatedById,
          name: inv.initiatedByName ?? 'Operator',
          email: inv.initiatedByEmail ?? null,
        }
      : null,
  };
}

@Injectable()
export class InvoiceLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  /** Paginated invoice ledger for one client, with the internal filters. */
  async listForClient(userId: string, filters: ListFilters) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 10));

    const where: Record<string, unknown> = { userId };
    if (filters.businessStatus) where.businessStatus = filters.businessStatus;
    if (filters.minAmount != null || filters.maxAmount != null) {
      const total: Record<string, number> = {};
      if (filters.minAmount != null) total.gte = filters.minAmount;
      if (filters.maxAmount != null) total.lte = filters.maxAmount;
      where.total = total;
    }
    if (filters.search?.trim()) {
      where.invoiceNumber = {
        contains: filters.search.trim(),
        mode: 'insensitive',
      };
    }

    const [rows, totalItems] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: rows.map(invoiceRow),
      meta: {
        page,
        pageSize,
        totalItems,
        selectableTotalItems: totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      },
    };
  }

  async getInvoice(userId: string, invoiceId: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, userId },
      include: { payments: { orderBy: { paidAt: 'desc' } } },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    return {
      ...invoiceRow(inv),
      lineItems: inv.lineItems,
      payments: inv.payments.map((p) => ({
        id: p.id,
        amount: p.amount.toFixed(2),
        method: p.method,
        status: p.status,
        paidAt: p.paidAt.toISOString(),
        referenceNumber: p.referenceNumber,
      })),
    };
  }
}
