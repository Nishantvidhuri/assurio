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

  async htmlToPdf(
    html: string,
    opts: {
      printBackground?: boolean;
      /** Chromium-native repeating header/footer (supports `.pageNumber` etc). */
      headerTemplate?: string;
      footerTemplate?: string;
      margin?: { top?: string; bottom?: string; left?: string; right?: string };
      /**
       * Render on a custom-width page instead of A4 — e.g. the tax invoice is a
       * 600px-wide document, so the page width matches the content (no side
       * margins) and, with fitHeight, one page trimmed to the content (no
       * bottom gap). Matches Recriauth's fixed-size invoice PDF.
       */
      pageWidthPx?: number;
      fitHeight?: boolean;
      /** CSS selector whose rendered height the page is trimmed to (default '.page'). */
      fitSelector?: string;
    } = {},
  ): Promise<Buffer> {
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
      // A repeating footer/header (e.g. the report's page-number banner) is
      // rendered by Chromium on every physical page — real page numbers without
      // a pdf-lib post-pass. Providing a template implies displayHeaderFooter.
      const hasChrome = Boolean(opts.headerTemplate || opts.footerTemplate);

      // Fixed-width document (tax invoice): page = content width, height fit to
      // the document, zero margins — no side/top/bottom whitespace.
      if (opts.pageWidthPx) {
        const sel = opts.fitSelector ?? '.page';
        const height = opts.fitHeight
          ? await page.evaluate((s: string) => {
              const el = document.querySelector(s) as HTMLElement | null;
              return Math.ceil((el?.scrollHeight ?? document.body.scrollHeight) + 1);
            }, sel)
          : undefined;
        const pdf = await page.pdf({
          printBackground: opts.printBackground ?? false,
          width: `${opts.pageWidthPx}px`,
          ...(height ? { height: `${height}px` } : {}),
          margin: { top: '0', bottom: '0', left: '0', right: '0' },
        });
        return Buffer.from(pdf);
      }

      const pdf = await page.pdf({
        format: 'A4',
        // Default false = skip background raster bitmaps → PDF stays ~30-80 KB.
        // The invoice HTML looks good without backgrounds; the candidate report
        // opts in (printBackground:true) so its status pills / risk colours render.
        printBackground: opts.printBackground ?? false,
        displayHeaderFooter: hasChrome,
        headerTemplate: opts.headerTemplate ?? '<span></span>',
        footerTemplate: opts.footerTemplate ?? '<span></span>',
        margin: {
          top: opts.margin?.top ?? '10mm',
          bottom: opts.margin?.bottom ?? '14mm',
          left: opts.margin?.left ?? '12mm',
          right: opts.margin?.right ?? '12mm',
        },
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
