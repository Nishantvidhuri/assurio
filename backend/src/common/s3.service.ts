import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    // Prefer the AWS_* names (real S3, used by this project's .env); fall back
    // to the older S3_* names (Cloudflare R2 style) for backward compatibility.
    this.bucket = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET || '';
    // R2 needs a custom endpoint; real AWS S3 leaves this undefined.
    const endpoint = process.env.S3_ENDPOINT || undefined;
    const region =
      process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1';
    const accessKeyId =
      process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID || '';
    const secretAccessKey =
      process.env.AWS_SECRET_ACCESS_KEY ||
      process.env.S3_SECRET_ACCESS_KEY ||
      '';

    if (!this.bucket || !accessKeyId || !secretAccessKey) {
      this.logger.warn(
        'S3 env vars not fully configured — uploads will be skipped.',
      );
    }

    this.client = new S3Client({
      region,
      // Only pass endpoint when set (R2); omitting it uses the default AWS host.
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  get isConfigured(): boolean {
    return Boolean(
      (process.env.AWS_S3_BUCKET || process.env.S3_BUCKET) &&
        (process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID) &&
        (process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY),
    );
  }

  /** Upload a buffer and return the object key. */
  async upload(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ContentDisposition: `inline; filename="${key.split('/').pop()}"`,
      }),
    );
    this.logger.log(`Uploaded s3://${this.bucket}/${key}`);
    return key;
  }

  /** Delete a single object by key. Safe no-op if it doesn't exist. */
  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    this.logger.log(`Deleted s3://${this.bucket}/${key}`);
  }

  /**
   * Generate a presigned GET URL for a stored object.
   * Default expiry: 7 days (604 800 s) — the maximum R2/S3 allows.
   */
  async presignedUrl(key: string, expiresIn = 604800): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn });
  }
}
