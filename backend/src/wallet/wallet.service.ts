import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  Prisma,
  Wallet,
  WalletTransaction,
  WalletTransactionReason,
  WalletTransactionType,
} from '../../generated/prisma/client';
import { MAX_BALANCE_PAISE } from './wallet.constants';

export interface LedgerEntryArgs {
  userId: string;
  type: WalletTransactionType;
  reason: WalletTransactionReason;
  /** Integer paise, always positive — direction comes from `type`. */
  amountPaise: number;
  /** Names the real-world event; unique in the DB → exactly-once. */
  idempotencyKey: string;
  subjectId?: string;
  invoiceId?: string;
  razorpayPaymentId?: string;
  note?: string;
  createdByUserId?: string;
  /**
   * Refunds set this false: returning held money must never fail on the
   * balance cap. Cannot overflow — refunds only mirror money that passed the
   * cap on the way in.
   */
  enforceCap?: boolean;
}

export interface LedgerResult {
  /** false ⇒ this event was already applied earlier (idempotent no-op). */
  applied: boolean;
  txn: WalletTransaction;
  balancePaise: number;
}

export class InsufficientBalanceError extends BadRequestException {
  constructor(requiredPaise: number, availablePaise: number) {
    super({
      message: 'Insufficient wallet balance',
      code: 'INSUFFICIENT_WALLET_BALANCE',
      requiredPaise,
      availablePaise,
    });
  }
}

/**
 * The wallet ledger core. Every money movement goes through {@link apply},
 * which runs inside a transaction holding a `SELECT … FOR UPDATE` lock on the
 * wallet row, so per-wallet mutations are fully serialised:
 *
 *   pre-check key → lock wallet row → re-check key → guard funds/cap →
 *   update cached balance → insert immutable ledger row
 *
 * The unique idempotencyKey plus the row lock make the sequence exactly-once
 * under any interleaving of retries, double-clicks, or concurrent jobs; the
 * whole-transaction atomicity keeps the cached balance and the ledger in
 * lockstep. Ledger rows are never updated or deleted.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(userId: string): Promise<Wallet> {
    try {
      return await this.prisma.wallet.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
    } catch (err) {
      // Concurrent first-touch can race the unique(userId) — the other writer won.
      const again = await this.prisma.wallet.findUnique({ where: { userId } });
      if (again) return again;
      throw err;
    }
  }

  async balancePaise(userId: string): Promise<number> {
    const w = await this.prisma.wallet.findUnique({ where: { userId } });
    return w?.balancePaise ?? 0;
  }

  listTransactions(
    userId: string,
    opts: { take?: number; cursor?: string } = {},
  ): Promise<WalletTransaction[]> {
    const take = Math.min(Math.max(opts.take ?? 50, 1), 100);
    return this.prisma.walletTransaction.findMany({
      where: { wallet: { userId } },
      orderBy: { createdAt: 'desc' },
      take,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
  }

  findByIdempotencyKey(key: string): Promise<WalletTransaction | null> {
    return this.prisma.walletTransaction.findUnique({
      where: { idempotencyKey: key },
    });
  }

  /** Standalone credit in its own transaction. */
  credit(args: Omit<LedgerEntryArgs, 'type'>): Promise<LedgerResult> {
    return this.prisma.$transaction((tx) =>
      this.apply(tx, { ...args, type: 'CREDIT' }),
    );
  }

  /** Standalone debit in its own transaction. */
  debit(args: Omit<LedgerEntryArgs, 'type'>): Promise<LedgerResult> {
    return this.prisma.$transaction((tx) =>
      this.apply(tx, { ...args, type: 'DEBIT' }),
    );
  }

  /**
   * Apply one ledger entry inside the caller's transaction — used to make a
   * charge atomic with the write it pays for (subject create, consent flip).
   * If this throws, the caller's whole transaction rolls back, so money and
   * the thing it paid for always move together or not at all.
   */
  async apply(
    tx: Prisma.TransactionClient,
    args: LedgerEntryArgs,
  ): Promise<LedgerResult> {
    const amount = args.amountPaise;
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive integer (paise)');
    }
    if (amount > MAX_BALANCE_PAISE) {
      throw new BadRequestException('Amount exceeds the per-entry limit');
    }

    // Cheap fast-path: this event was already applied.
    const seen = await tx.walletTransaction.findUnique({
      where: { idempotencyKey: args.idempotencyKey },
      include: { wallet: true },
    });
    if (seen) {
      return { applied: false, txn: seen, balancePaise: seen.wallet.balancePaise };
    }

    let wallet = await tx.wallet.findUnique({ where: { userId: args.userId } });
    if (!wallet) {
      wallet = await tx.wallet.create({ data: { userId: args.userId } });
    }

    // Serialise all writers for this wallet; also fences the idempotency
    // re-check below against inserts that happened after the fast-path read.
    await tx.$queryRaw`SELECT "id" FROM "Wallet" WHERE "id" = ${wallet.id} FOR UPDATE`;

    const seenAfterLock = await tx.walletTransaction.findUnique({
      where: { idempotencyKey: args.idempotencyKey },
    });
    if (seenAfterLock) {
      const fresh = await tx.wallet.findUniqueOrThrow({
        where: { id: wallet.id },
      });
      return {
        applied: false,
        txn: seenAfterLock,
        balancePaise: fresh.balancePaise,
      };
    }

    const current = (
      await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
    ).balancePaise;

    const next =
      args.type === 'CREDIT' ? current + amount : current - amount;
    if (next < 0) {
      throw new InsufficientBalanceError(amount, current);
    }
    if (
      args.type === 'CREDIT' &&
      (args.enforceCap ?? true) &&
      next > MAX_BALANCE_PAISE
    ) {
      throw new BadRequestException(
        'This top-up would exceed the wallet balance limit',
      );
    }

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balancePaise: next },
    });
    const txn = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: args.type,
        reason: args.reason,
        amountPaise: amount,
        balanceAfterPaise: next,
        subjectId: args.subjectId,
        invoiceId: args.invoiceId,
        razorpayPaymentId: args.razorpayPaymentId,
        idempotencyKey: args.idempotencyKey,
        note: args.note,
        createdByUserId: args.createdByUserId,
      },
    });

    this.logger.log(
      `${args.type} ${amount}p wallet=${wallet.id} reason=${args.reason} key=${args.idempotencyKey} balance=${next}p`,
    );
    return { applied: true, txn, balancePaise: next };
  }
}
