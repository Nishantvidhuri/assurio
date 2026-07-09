import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({
  collection: 'users',
  timestamps: { createdAt: true, updatedAt: false },
})
export class User {
  @Prop({
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true,
  })
  email: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true })
  passwordHash: string;

  /** 'owner' (account holder) or 'admin'. */
  @Prop({ default: 'owner' })
  role: string;

  /** WhatsApp / mobile number — used for client notifications. */
  @Prop({ type: String, default: null, trim: true })
  phone: string | null;

  /** Single-use token for /reset/:token password reset. */
  @Prop({ type: String, default: null })
  resetToken: string | null;

  @Prop({ type: Date, default: null })
  resetTokenExpiresAt: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
