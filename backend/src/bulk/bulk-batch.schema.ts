import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type BulkBatchDocument = HydratedDocument<BulkBatch>;

export interface BatchError {
  row: number;
  email: string;
  reason: string;
}

@Schema({ timestamps: true, collection: 'bulk_batches' })
export class BulkBatch {
  @Prop({ required: true }) batchId: string;
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) total: number;
  @Prop({ default: 0 }) done: number;
  @Prop({ default: 0 }) failed: number;
  @Prop({ default: 'pending' }) status: string; // pending | processing | done
  @Prop({ type: [{ row: SchemaTypes.Number, email: SchemaTypes.String, reason: SchemaTypes.String }], default: [] })
  failedRows: BatchError[];
}

export const BulkBatchSchema = SchemaFactory.createForClass(BulkBatch);
