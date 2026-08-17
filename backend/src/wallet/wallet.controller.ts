import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../common/prisma.service';
import { WalletService } from './wallet.service';
import {
  MAX_TOPUP_PAISE,
  MIN_TOPUP_PAISE,
  paiseToRupees,
  toPaise,
  topupKey,
  WALLET_LEDGER_EPOCH,
} from './wallet.constants';
import { WalletTransaction } from '../../generated/prisma/client';

interface RequestWithUser extends Request {
  user?: { sub?: string; role?: string; email?: string };
}

function toTxnResponse(t: WalletTransaction) {
  return {
    id: t.id,
    type: t.type,
    reason: t.reason,
    amountPaise: t.amountPaise,
    balanceAfterPaise: t.balanceAfterPaise,
    subjectId: t.subjectId,
    invoiceId: t.invoiceId,
    note: t.note,
    createdAt: t.createdAt,
  };
}

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async info(@Req() req: RequestWithUser) {
    const userId = this.requireOwner(req);
    const w = await this.wallet.getOrCreate(userId);
    return {
      balancePaise: w.balancePaise,
      balanceInr: paiseToRupees(w.balancePaise),
      currency: w.currency,
    };
  }

  @Get('transactions')
  async transactions(
    @Req() req: RequestWithUser,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    const userId = this.requireOwner(req);
    const parsedTake = Number.parseInt(take ?? '', 10);
    const items = await this.wallet.listTransactions(userId, {
      take: Number.isFinite(parsedTake) ? parsedTake : undefined,
      cursor: cursor || undefined,
    });
    return {
      items: items.map(toTxnResponse),
      nextCursor: items.length > 0 ? items[items.length - 1].id : null,
    };
  }

  /** Create a Razorpay Order for adding money to the wallet. */
  @Post('topup/order')
  async topupOrder(
    @Req() req: RequestWithUser,
    @Body() body: { amount?: number },
  ) {
    const userId = this.requireOwner(req);
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }
    const amountPaise = toPaise(amount);
    if (amountPaise < MIN_TOPUP_PAISE) {
      throw new BadRequestException(
        `Minimum top-up is ₹${paiseToRupees(MIN_TOPUP_PAISE)}`,
      );
    }
    if (amountPaise > MAX_TOPUP_PAISE) {
      throw new BadRequestException(
        `Maximum top-up is ₹${paiseToRupees(MAX_TOPUP_PAISE).toLocaleString('en-IN')}`,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Account not found');

    const order = await this.payments.createOrder({
      amount,
      receipt: `wallet-${userId.slice(-8)}`,
      notes: {
        flow: 'wallet-topup',
        customer_name: user.name,
        customer_email: user.email,
        customer_contact: user.phone ?? '',
        description: 'Assurio wallet top-up',
      },
    });
    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: this.payments.publicKeyId,
    };
  }

  /**
   * Verify the Razorpay checkout callback and credit the wallet. Exactly-once:
   * the ledger key is derived from the razorpayPaymentId, so replaying this
   * call (or racing it from two tabs) can never credit twice. The GST invoice
   * is created through the existing idempotent invoice path.
   */
  @Post('topup/verify')
  async topupVerify(
    @Req() req: RequestWithUser,
    @Body()
    body: {
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    },
  ) {
    const userId = this.requireOwner(req);
    if (
      !body.razorpay_order_id ||
      !body.razorpay_payment_id ||
      !body.razorpay_signature
    ) {
      throw new BadRequestException('Missing Razorpay callback parameters');
    }
    const ok = this.payments.verifyOrderSignature({
      order_id: body.razorpay_order_id,
      payment_id: body.razorpay_payment_id,
      signature: body.razorpay_signature,
    });
    if (!ok) return { verified: false };

    const invoice = await this.payments.createOrGetInvoiceFromOrder({
      userId,
      razorpayOrderId: body.razorpay_order_id,
      razorpayPaymentId: body.razorpay_payment_id,
    });
    // The invoice path is idempotent on paymentId — if it already existed it
    // may belong to someone else's payment; never credit across accounts.
    if (invoice.userId !== userId) {
      throw new ForbiddenException('This payment belongs to another account');
    }
    if (invoice.createdAt < WALLET_LEDGER_EPOCH) {
      throw new BadRequestException(
        'This payment predates the wallet and cannot be credited',
      );
    }

    const res = await this.wallet.credit({
      userId,
      reason: 'TOPUP',
      amountPaise: toPaise(invoice.total),
      idempotencyKey: topupKey(body.razorpay_payment_id),
      invoiceId: invoice.id,
      razorpayPaymentId: body.razorpay_payment_id,
      note: 'Wallet top-up via Razorpay',
    });
    return {
      verified: true,
      credited: res.applied,
      balancePaise: res.balancePaise,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
    };
  }

  /** Support tool: manual credit/debit with a mandatory audit note. Admin only. */
  @Post('admin/adjust')
  async adminAdjust(
    @Req() req: RequestWithUser,
    @Body()
    body: {
      userId?: string;
      direction?: 'credit' | 'debit';
      amountInr?: number;
      note?: string;
    },
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    const targetId = (body.userId || '').trim();
    const note = (body.note || '').trim();
    const amount = Number(body.amountInr);
    if (!targetId) throw new BadRequestException('userId is required');
    if (!note) throw new BadRequestException('An audit note is required');
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amountInr must be a positive number');
    }
    if (body.direction !== 'credit' && body.direction !== 'debit') {
      throw new BadRequestException("direction must be 'credit' or 'debit'");
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new BadRequestException('No such user');

    const args = {
      userId: targetId,
      amountPaise: toPaise(amount),
      idempotencyKey: `admin:${randomUUID()}`,
      note,
      createdByUserId: req.user?.sub,
    } as const;
    const res =
      body.direction === 'credit'
        ? await this.wallet.credit({ ...args, reason: 'ADMIN_CREDIT' })
        : await this.wallet.debit({ ...args, reason: 'ADMIN_DEBIT' });
    return { ok: true, balancePaise: res.balancePaise };
  }

  private requireOwner(req: RequestWithUser): string {
    if (req.user?.role === 'candidate') {
      throw new ForbiddenException('Account holder access required');
    }
    const userId = req.user?.sub;
    if (!userId) throw new BadRequestException('Missing user');
    return userId;
  }
}
