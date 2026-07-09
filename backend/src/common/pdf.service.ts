import { Injectable, Logger } from '@nestjs/common';
import puppeteer, { type Browser } from 'puppeteer-core';

/**
 * Converts HTML strings to PDF buffers using an existing Chrome/Chromium install.
 *
 * Looks for the browser executable in this order:
 *   1. CHROME_EXECUTABLE_PATH env var
 *   2. macOS: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
 *   3. Linux: /usr/bin/google-chrome-stable → /usr/bin/google-chrome → /usr/bin/chromium-browser → /usr/bin/chromium
 */
@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  private get executablePath(): string {
    if (process.env.CHROME_EXECUTABLE_PATH) {
      return process.env.CHROME_EXECUTABLE_PATH;
    }
    if (process.platform === 'darwin') {
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    }
    // Linux — try common paths in order; puppeteer will throw if the path is wrong
    const linuxPaths = [
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
    ];
    const { existsSync } = require('fs') as typeof import('fs');
    for (const p of linuxPaths) {
      if (existsSync(p)) return p;
    }
    return linuxPaths[0]; // let puppeteer surface the error
  }

  async htmlToPdf(html: string): Promise<Buffer> {
    let browser: Browser | null = null;
    try {
      browser = await puppeteer.launch({
        executablePath: this.executablePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        // false = skip background raster bitmaps → PDF stays ~30-80 KB instead of 400 KB+
        // The invoice/report HTML already has @media print styles that look good without backgrounds.
        printBackground: false,
        margin: { top: '10mm', bottom: '10mm', left: '12mm', right: '12mm' },
      });
      return Buffer.from(pdf);
    } finally {
      if (browser) {
        await browser.close().catch((err: unknown) =>
          this.logger.warn('Browser close failed', err),
        );
      }
    }
  }
}
