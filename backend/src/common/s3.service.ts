import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
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

  /**
   * Presign a PUT URL so the client can upload bytes directly to S3 without the
   * API ever buffering the file. Returns the URL plus the exact headers the
   * client MUST echo on the PUT for the signature to validate (Content-Type,
   * and any x-amz-meta-* the caller supplies). Default TTL: 15 minutes.
   */
  async createPresignedPutUrl(
    key: string,
    contentType: string,
    expiresIn = 900,
    metadata?: Record<string, string>,
  ): Promise<{ uploadUrl: string; requiredHeaders: Record<string, string> }> {
    // Only sign Content-Type (+ any metadata). Extra signed headers like
    // ContentDisposition would force the browser to echo them on the PUT or the
    // signature fails — inline viewing is instead handled at GET time.
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ...(metadata ? { Metadata: metadata } : {}),
    });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn });

    // The signature covers these headers, so the browser PUT has to send them
    // verbatim. Metadata is signed as x-amz-meta-<key>.
    const requiredHeaders: Record<string, string> = {
      'Content-Type': contentType,
    };
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        requiredHeaders[`x-amz-meta-${k}`] = v;
      }
    }
    return { uploadUrl, requiredHeaders };
  }

  /**
   * HEAD an object to confirm it exists and read its size + etag. Used by the
   * finalize job to verify the client's direct PUT actually landed and matches
   * the declared size. Throws (NotFound / etc.) when the object is absent —
   * callers treat that as "PUT hasn't completed yet" and retry.
   */
  async headObject(
    key: string,
  ): Promise<{ size: number; etag: string | null; contentType: string | null }> {
    const res = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return {
      size: res.ContentLength ?? 0,
      etag: res.ETag ? res.ETag.replace(/"/g, '') : null,
      contentType: res.ContentType ?? null,
    };
  }

  /**
   * Resolve a stored image reference to something a browser / PDF renderer can
   * load. Backward-compatible: legacy base64 data-URLs and absolute http(s)
   * URLs pass through unchanged; an S3 object key is presigned (GET). Returns
   * null on empty input or a signing failure so callers can render a fallback.
   */
  async resolveViewableUrl(
    value: string | null | undefined,
  ): Promise<string | null> {
    if (!value) return null;
    if (value.startsWith('data:') || value.startsWith('http')) return value;
    return this.presignedUrl(value).catch(() => null);
  }

  /** Download a stored object into a Buffer — used by the virus-scan job. */
  async getObjectBuffer(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!res.Body) {
      throw new Error(`S3 object ${key} has no body`);
    }
    // Node stream → Buffer. The AWS SDK v3 Body is a Readable in Node.
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
