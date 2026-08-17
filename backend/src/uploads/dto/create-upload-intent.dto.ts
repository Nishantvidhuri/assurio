import { IsIn, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  ALLOWED_CONTENT_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
} from '../uploads.constants';

/**
 * Body for `POST /uploads/intent`. The client declares what it's about to
 * upload; the server presigns a direct-to-S3 PUT for it. No bytes here.
 */
export class CreateUploadIntentDto {
  /** e.g. AADHAAR / PAN / … or a generic label like ID_DOCUMENT. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  category!: string;

  @IsString()
  @IsIn(Object.keys(ALLOWED_CONTENT_TYPES))
  contentType!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_SIZE_BYTES)
  sizeBytes!: number;
}
