import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  rate: number; // in rupees, pre-tax
  total: number; // qty * rate, in rupees, pre-tax
}

@Schema({ timestamps: true })
export class Invoice {
  @Prop({ required: true, unique: true })
  invoiceNumber!: string; // e.g. ASR-202605-000001

  @Prop({ required: true })
  userId!: string;

  @Prop()
  subjectId?: string;

  /** Buyer / billed-to. */
  @Prop({ required: true })
  customerName!: string;

  @Prop({ required: true })
  customerEmail!: string;

  @Prop()
  customerPhone?: string;

  @Prop({ type: [Object], default: [] })
  lineItems!: InvoiceLineItem[];

  /** All amounts in rupees. */
  @Prop({ required: true })
  subtotal!: number;

  @Prop({ required: true })
  tax!: number;

  @Prop({ required: true })
  total!: number;

  @Prop({ default: 18 })
  taxRatePercent!: number;

  @Prop({ default: 'INR' })
  currency!: string;

  @Prop({ default: 'paid' })
  status!: string;

  /** Razorpay references (unique per payment). */
  @Prop({ required: true, unique: true, index: true })
  razorpayPaymentId!: string;

  @Prop()
  razorpayPaymentLinkId?: string;

  @Prop()
  razorpayPaymentLinkReferenceId?: string;

  @Prop()
  paidAt?: Date;

  /** S3 object key for the stored invoice PDF (e.g. invoices/ASR-202605-000001.pdf). */
  @Prop({ type: String })
  pdfS3Key?: string;

  /** Pulled from Razorpay notes — useful for the receipt body. */
  @Prop({ type: Object })
  notes?: Record<string, string>;
}

export type InvoiceDocument = Invoice & Document;
export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
