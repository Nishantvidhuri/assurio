import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OutboxEventType =
  | 'email.invite'
  | 'email.password-reset'
  | 'billing.invoice-notification';

export type OutboxStatus = 'pending' | 'processing' | 'sent' | 'failed';

@Schema({ timestamps: true, collection: 'outbox_events' })
export class OutboxEvent {
  @Prop({ required: true }) eventType!: OutboxEventType;
  @Prop({ type: Object, required: true }) payload!: Record<string, unknown>;
  @Prop({ default: 'pending', index: true }) status!: OutboxStatus;
  @Prop({ default: 0 }) attempts!: number;
  @Prop({ default: 5 }) maxAttempts!: number;
  @Prop({ default: () => new Date(), index: true }) processAfter!: Date;
  @Prop({ type: Date, default: null }) processedAt!: Date | null;
  @Prop({ type: String, default: null }) lastError!: string | null;
  @Prop({ type: String, default: null, index: true, sparse: true }) idempotencyKey!: string | null;
}

export type OutboxEventDocument = OutboxEvent & Document;
export const OutboxEventSchema = SchemaFactory.createForClass(OutboxEvent);
