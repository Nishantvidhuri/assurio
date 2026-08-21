import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_TOPUP_PAISE } from '../wallet/wallet.constants';

/**
 * An operator crediting a client's wallet by hand — a bank transfer received
 * outside Razorpay, a goodwill credit, a correction.
 *
 * Amount is taken in PAISE, not rupees. Every ledger entry in this system is
 * an integer paise amount; accepting rupees here would mean a float crossing
 * the wire and rounding deciding how much money someone has.
 */
export class AdminWalletCreditDto {
  @IsInt({ message: 'Amount must be a whole number of paise' })
  @Min(100, { message: 'Amount must be at least ₹1' })
  @Max(MAX_TOPUP_PAISE, { message: 'Amount exceeds the single top-up limit' })
  amountPaise: number;

  /**
   * Why the money was added. Required: a manual credit with no stated reason is
   * indistinguishable from a mistake when someone audits the ledger later.
   */
  @IsString()
  @MaxLength(280, { message: 'Note must be at most 280 characters' })
  note: string;

  /**
   * Supplied by the client so a double-submit credits once. Unlike a Razorpay
   * top-up there is no external event to key on, so the caller names the
   * intent; the ledger's unique constraint does the rest.
   */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  requestId?: string;
}
