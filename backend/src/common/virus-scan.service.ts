import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'node:net';

export interface ScanResult {
  clean: boolean;
  infected: boolean;
  engine: string;
  details: Record<string, unknown>;
}

/**
 * Streams an uploaded buffer to a ClamAV daemon and reports whether it is
 * clean. Ported from Recriauth's DocumentVirusScanService — it opens a TCP
 * socket, sends `zINSTREAM`, chunks the file in 64 KB frames, and parses the
 * daemon's reply (`... OK` = clean, `... FOUND` = infected).
 *
 * Scanning is required in every environment: if ClamAV is unreachable the
 * scan throws and the upload is rejected (fail-closed), so nothing unscanned
 * ever reaches S3. Run a daemon locally with:
 *   docker run -d --name clamav -p 3310:3310 clamav/clamav
 */
@Injectable()
export class VirusScanService {
  private readonly logger = new Logger(VirusScanService.name);

  async scanBuffer(buffer: Buffer, filename: string): Promise<ScanResult> {
    const host = process.env.CLAMAV_HOST?.trim() || '127.0.0.1';
    const port = Number.parseInt(
      process.env.CLAMAV_PORT?.trim() ?? '3310',
      10,
    );

    let response: string;
    try {
      response = await this.scanWithClamAv(host, port, buffer);
    } catch (error) {
      this.logger.error(
        `ClamAV scan failed for ${filename} (${host}:${port}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new Error(
        'Virus scanning is unavailable. Please try again shortly.',
      );
    }

    const infected = response.includes('FOUND');
    const clean = response.includes('OK') && !infected;

    return {
      clean,
      infected,
      engine: 'clamav',
      details: { rawResponse: response },
    };
  }

  private scanWithClamAv(host: string, port: number, buffer: Buffer) {
    return new Promise<string>((resolve, reject) => {
      const socket = new Socket();
      const responseChunks: Buffer[] = [];

      socket.once('error', (error) => {
        socket.destroy();
        reject(error);
      });

      socket.on('data', (chunk) => {
        responseChunks.push(chunk);
      });

      socket.once('close', () => {
        const response = Buffer.concat(responseChunks)
          .toString('utf8')
          .replace(/\0/g, '')
          .trim();
        if (!response) {
          reject(new Error('ClamAV returned an empty response'));
          return;
        }
        resolve(response);
      });

      socket.connect(port, host, () => {
        socket.write('zINSTREAM\0');

        let offset = 0;
        while (offset < buffer.length) {
          const chunk = buffer.subarray(offset, offset + 64 * 1024);
          const length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.length, 0);
          socket.write(length);
          socket.write(chunk);
          offset += chunk.length;
        }

        const terminator = Buffer.alloc(4);
        terminator.writeUInt32BE(0, 0);
        socket.write(terminator);
        socket.end();
      });
    });
  }
}
