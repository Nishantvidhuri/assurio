import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET || '';
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION || 'auto';
    const accessKeyId = process.env.S3_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || '';

    if (!this.bucket || !endpoint || !accessKeyId || !secretAccessKey) {
      this.logger.warn(
        'S3 env vars not fully configured — PDF uploads will be skipped.',
      );
    }

    this.client = new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      // Cloudflare R2 requires path-style addressing.
      forcePathStyle: false,
    });
  }

  get isConfigured(): boolean {
    return Boolean(
      process.env.S3_BUCKET &&
        process.env.S3_ENDPOINT &&
        process.env.S3_ACCESS_KEY_ID &&
        process.env.S3_SECRET_ACCESS_KEY,
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

  /**
   * Generate a presigned GET URL for a stored object.
   * Default expiry: 7 days (604 800 s) — the maximum R2/S3 allows.
   */
  async presignedUrl(key: string, expiresIn = 604800): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn });
  }
}
