import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EventsService } from '../common/events.service';
import { WalletService } from './wallet.service';
import { chargeKey, consentExpiryDays, refundKey } from './wallet.constants';
import { ConsentStatus, Prisma } from '../../generated/prisma/client';

export type GrantOutcome = 'granted' | 'already' | 'closed' | 'missing';

export interface SettleResult {
  /** true ⇒ this call won the PENDING → DECLINED/EXPIRED transition. */
  transitioned: boolean;
  /** Paise credited back to the client wallet by this call (0 if no hold existed). */
  refundedPaise: number;
}

/**
 * The consent state machine and its money settlement.
 *
 * Core invariant — the client can never lose money or be paid twice:
 * every transition out of PENDING is a conditional update
 * (`WHERE consentStatus = 'PENDING'`), so exactly one of GRANTED / DECLINED /
 * EXPIRED ever wins. Checks only run after a won GRANT; the refund only
 * happens inside the same transaction as a won DECLINE/EXPIRE, mirrors the
 * original charge ledger row paise-for-paise, and carries a per-subject unique
 * idempotency key. Retries, double-clicks, and the sweep racing a decline all
 * collapse to a single outcome.
 */
@Injectable()
export class ConsentSettlementService {
  private readonly logger = new Logger(ConsentSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly wallet: WalletService,
  ) {}

  /**
   * Candidate agreed. Returns 'granted' exactly once per subject — the caller
   * must only start the paid checks on that outcome, never on 'already'
   * (checks were started by the winning call) or 'closed' (declined/expired —
   * the money has been refunded, running checks now would double-spend).
   */
  async grantConsent(subjectId: string): Promise<GrantOutcome> {
    const flip = await this.prisma.subject.updateMany({
      where: { id: subjectId, consentStatus: 'PENDING' },
      data: { consentStatus: 'GRANTED', consentDecidedAt: new Date() },
    });
    if (flip.count === 1) {
      await this.emitSubject(subjectId);
      return 'granted';
    }
    const doc = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      select: { consentStatus: true },
    });
    if (!doc) return 'missing';
    return doc.consentStatus === 'GRANTED' ? 'already' : 'closed';
  }

  /** Candidate declined via the verification link. */
  decline(subjectId: string): Promise<SettleResult> {
    return this.settle(
      subjectId,
      'DECLINED',
      'Refund — candidate declined consent',
    );
  }

  /** Consent request went unanswered past the deadline. */
  expire(subjectId: string): Promise<SettleResult> {
    return this.settle(
      subjectId,
      'EXPIRED',
      'Refund — consent request expired unanswered',
    );
  }

  /** Owner deleted the candidate while consent was still pending. */
  refundOnDelete(subjectId: string): Promise<SettleResult> {
    return this.settle(
      subjectId,
      'DECLINED',
      'Refund — verification cancelled before consent',
    );
  }

  /**
   * Sweep: auto-expire consent requests that have sat unanswered past the
   * deadline and return their holds to the client wallets. Safe to run
   * concurrently or repeatedly — settle() is race-proof per subject.
   */
  async expireStale(): Promise<{ expired: number; refundedPaise: number }> {
    const cutoff = new Date(
      Date.now() - consentExpiryDays() * 24 * 60 * 60 * 1000,
    );
    const stale = await this.prisma.subject.findMany({
      where: { consentStatus: 'PENDING', createdAt: { lt: cutoff } },
      select: { id: true },
      take: 100,
    });
    let expired = 0;
    let refundedPaise = 0;
    for (const { id } of stale) {
      try {
        const res = await this.expire(id);
        if (res.transitioned) expired += 1;
        refundedPaise += res.refundedPaise;
      } catch (err) {
        this.logger.error(
          `Consent-expiry settle failed for subject ${id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
    if (expired > 0) {
      this.logger.log(
        `Consent expiry: closed ${expired} subject(s), refunded ${refundedPaise}p`,
      );
    }
    return { expired, refundedPaise };
  }

  private async settle(
    subjectId: string,
    outcome: Extract<ConsentStatus, 'DECLINED' | 'EXPIRED'>,
    note: string,
  ): Promise<SettleResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.subject.findUnique({ where: { id: subjectId } });
      if (!doc) return { transitioned: false, refundedPaise: 0 };

      const prevConsent = (doc.consentResult ?? {}) as Record<string, unknown>;
      const stampField = outcome === 'DECLINED' ? 'declinedAt' : 'expiredAt';
      // The conditional WHERE is the whole ballgame: only one caller can move
      // the row out of PENDING, and everything below only runs for the winner.
      const flip = await tx.subject.updateMany({
        where: { id: subjectId, consentStatus: 'PENDING' },
        data: {
          consentStatus: outcome,
          consentDecidedAt: new Date(),
          consentResult: {
            ...prevConsent,
            agreedTerms: false,
            [stampField]: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      if (flip.count !== 1) return { transitioned: false, refundedPaise: 0 };

      // Refund exactly what was charged for this subject — read from the
      // original ledger row, never recomputed from today's package price.
      const charge = await tx.walletTransaction.findUnique({
        where: { idempotencyKey: chargeKey(subjectId) },
      });
      if (!charge) return { transitioned: true, refundedPaise: 0 };

      const refund = await this.wallet.apply(tx, {
        userId: doc.userId,
        type: 'CREDIT',
        reason: 'CONSENT_REFUND',
        amountPaise: charge.amountPaise,
        idempotencyKey: refundKey(subjectId),
        subjectId,
        note,
        enforceCap: false,
      });
      return {
        transitioned: true,
        refundedPaise: refund.applied ? charge.amountPaise : 0,
      };
    });

    if (result.transitioned) {
      this.logger.log(
        `Subject ${subjectId} consent ${outcome}; refunded ${result.refundedPaise}p`,
      );
      await this.emitSubject(subjectId);
    }
    return result;
  }

  /** Push the updated subject over SSE so open report views refresh live. */
  private async emitSubject(subjectId: string): Promise<void> {
    const doc = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (doc) this.events.emit(this.events.subjectChannel(subjectId), doc);
  }
}
