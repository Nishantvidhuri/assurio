import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SubjectDocument = HydratedDocument<Subject>;

@Schema({ collection: 'subjects', timestamps: true })
export class Subject {
  /** The account holder (inviter) who added this person. */
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, trim: true })
  name: string;

  /** Job role — e.g. Maid, Driver, Tenant. */
  @Prop({ trim: true, default: '' })
  role: string;

  @Prop({ trim: true, lowercase: true, default: '' })
  email: string;

  @Prop({ trim: true, default: '' })
  phone: string;

  /** Single-use token for the set-password invite link. */
  @Prop({ type: String, default: null })
  inviteToken: string | null;

  /** invited = link sent, not yet set up · active = password set. */
  @Prop({ default: 'invited' })
  status: string;

  /** Candidate's own login password (set via the invite link). */
  @Prop({ type: String, default: null })
  passwordHash: string | null;

  /** Uploaded PAN card images, stored as base64 data URLs. */
  @Prop({ type: String, default: null })
  panFront: string | null;

  @Prop({ type: String, default: null })
  panBack: string | null;

  /** Manually entered PAN number (kept alongside the auto check result). */
  @Prop({ type: String, default: null })
  panNumber: string | null;

  /** Uploaded Aadhaar card images. */
  @Prop({ type: String, default: null })
  aadhaarFront: string | null;

  @Prop({ type: String, default: null })
  aadhaarBack: string | null;

  /** Manually entered Aadhaar number. */
  @Prop({ type: String, default: null })
  aadhaarNumber: string | null;

  @Prop({ type: Object, default: null })
  panResult: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  aadhaarResult: Record<string, unknown> | null;

  @Prop({ type: String, default: null })
  digilockerClientId: string | null;

  @Prop({ type: String, default: null })
  digilockerUrl: string | null;

  @Prop({ type: String, default: null })
  crimeRequestId: string | null;

  @Prop({ type: Object, default: null })
  crimeResult: Record<string, unknown> | null;

  /** Candidate consent record — signature + acceptance metadata. */
  @Prop({ type: Object, default: null })
  consentResult: Record<string, unknown> | null;

  /** Append-only log of every verification API call. */
  @Prop({ type: [Object], default: [] })
  verificationLog: Array<{
    type: 'pan' | 'aadhaar' | 'crime';
    calledAt: Date;
    result: Record<string, unknown>;
  }>;

  /** Single-use token for /reset/:token password reset. */
  @Prop({ type: String, default: null })
  resetToken: string | null;

  @Prop({ type: Date, default: null })
  resetTokenExpiresAt: Date | null;
}

export const SubjectSchema = SchemaFactory.createForClass(Subject);
