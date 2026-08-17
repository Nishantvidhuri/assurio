import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';

/**
 * Sends WhatsApp messages via an OpenWA instance
 * (https://github.com/rmyndharis/OpenWA).
 *
 * Required env vars:
 *   OPENWA_URL        – Base URL of the OpenWA API, e.g. http://localhost:2785/api
 *   OPENWA_SESSION    – Session name/ID configured in OpenWA (e.g. "assurio")
 *
 * Optional:
 *   OPENWA_API_KEY      – X-API-Key header (only needed if you enabled API key auth
 *                         in your OpenWA dashboard; self-hosted instances can leave blank)
 *   OPENWA_COUNTRY_CODE – Default dialling code prepended to bare numbers (default: "91")
 *
 * If OPENWA_URL or OPENWA_SESSION are absent the service skips silently —
 * identical graceful-skip behaviour to EmailService.
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  /** Cache: session name/id string → resolved UUID (refreshed on each process restart) */
  private resolvedSessionId: string | null = null;

  /* ------------------------------------------------------------------ */
  /*  Public message templates                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Sent to the CANDIDATE when the client adds them.
   * Sends a branded image + rich caption that looks like an ad card.
   * Falls back to plain text if image sending fails.
   */
  async sendVerificationStarted(
    phone: string,
    candidateName: string,
    clientName: string,
    inviteUrl: string,
    role?: string,
  ): Promise<boolean> {
    const firstName = candidateName.split(' ')[0] || candidateName;
    const roleStr = role ? ` as *${role}*` : '';

    const caption =
      `Hey ${firstName} 👋\n\n` +
      `*${clientName}* registered you${roleStr} and initiated a background verification via *${clientName}*.\n\n` +
      `Tap below to begin — takes less than 10 minutes:\n` +
      `${inviteUrl}`;

    // Try sending with image header (looks like the ad-card format)
    const imageUrl =
      process.env.WHATSAPP_INVITE_IMAGE_URL ||
      'https://pbs.twimg.com/profile_images/1893698244586377216/I5dQ_qN1_400x400.jpg';

    const sent = await this.sendImageWithCaption(phone, imageUrl, caption);
    if (sent) return true;

    // Fallback: plain text
    return this.send(phone, caption);
  }

  /**
   * Downloads an image from a URL, converts to base64, and sends it via
   * OpenWA's send-document endpoint with an image mimetype + caption.
   * Uses a small/compressed variant of the URL to stay under the body limit.
   */
  private async sendImageWithCaption(
    rawPhone: string,
    imageUrl: string,
    caption: string,
  ): Promise<boolean> {
    const base = process.env.OPENWA_URL?.replace(/\/$/, '');
    const session = process.env.OPENWA_SESSION;
    const apiKey = process.env.OPENWA_API_KEY;
    if (!base || !session) return false;

    const chatId = this.toChatId(rawPhone);
    if (!chatId) return false;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;

    const sessionId = await this.resolveSessionId(base, session, headers);
    if (!sessionId) return false;

    let rawBase64: string;
    let mimetype = 'image/jpeg';

    // Local file path (starts with /) — read directly from disk
    if (imageUrl.startsWith('/')) {
      try {
        const buf = readFileSync(imageUrl);
        rawBase64 = buf.toString('base64');
        if (imageUrl.endsWith('.png')) mimetype = 'image/png';
        this.logger.log(`Local invite image read: ${Math.round(buf.byteLength / 1024)} KB`);
      } catch (err) {
        this.logger.warn(`Could not read local invite image "${imageUrl}": ${(err as Error).message}`);
        return false;
      }
    } else {
      // Remote URL — download it
      const smallUrl = imageUrl
        .replace(/[?&]w=\d+/, (m) => m.replace(/\d+/, '480'))
        .replace(/[?&]q=\d+/, (m) => m.replace(/\d+/, '55'));
      try {
        const imgRes = await fetch(smallUrl, { signal: AbortSignal.timeout(8000) });
        if (!imgRes.ok) throw new Error(`image fetch ${imgRes.status}`);
        const buf = await imgRes.arrayBuffer();
        rawBase64 = Buffer.from(buf).toString('base64');
        this.logger.log(`Image downloaded: ${Math.round(buf.byteLength / 1024)} KB → base64 ${Math.round(rawBase64.length / 1024)} KB`);
      } catch (err) {
        this.logger.warn(`Could not download invite image: ${(err as Error).message}`);
        return false;
      }
    }

    const sid = encodeURIComponent(sessionId);
    const filename = mimetype === 'image/png' ? 'verification.png' : 'verification.jpg';

    // ── Strategy 1: URL-based — only possible for remote URLs, skip for local files ──
    for (const urlEp of imageUrl.startsWith('/') ? [] : [
      `${base}/sessions/${sid}/messages/send-image`,
      `${base}/sessions/${sid}/messages/send-file-from-url`,
    ]) {
      try {
        const res = await fetch(urlEp, {
          method: 'POST',
          headers,
          body: JSON.stringify({ chatId, url: imageUrl, mimetype, filename, caption }),
        });
        if (res.ok) {
          this.logger.log(`WhatsApp image sent to ${chatId} via ${urlEp.split('/').pop()} (url)`);
          return true;
        }
        const rb = await res.text().catch(() => '');
        if (res.status === 400 && rb.includes('not active')) {
          this.resolvedSessionId = null;
          this.logger.warn('OpenWA session inactive — reconnect in dashboard.');
          return false;
        }
        // 404/405 = endpoint doesn't exist in this fork, skip silently
        if (res.status !== 404 && res.status !== 405) {
          this.logger.warn(`OpenWA ${urlEp.split('/').pop()} (url) → ${res.status}: ${rb.slice(0, 120)}`);
        }
      } catch (err) {
        this.logger.warn(`OpenWA url-image fetch error: ${(err as Error)?.message}`);
      }
    }

    // ── Strategy 2: raw base64 + mimetype as separate field (required by this fork) ──
    for (const ep of [
      `${base}/sessions/${sid}/messages/send-image`,
      `${base}/sessions/${sid}/messages/send-document`,
    ]) {
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chatId,
            base64: rawBase64,
            mimetype,
            filename,
            caption,
          }),
        });

        if (res.ok) {
          this.logger.log(`WhatsApp image sent to ${chatId} via ${ep.split('/').pop()} (base64)`);
          return true;
        }

        const resBody = await res.text().catch(() => '');
        if (res.status === 400 && resBody.includes('not active')) {
          this.resolvedSessionId = null;
          this.logger.warn('OpenWA session inactive — reconnect in dashboard.');
          return false;
        }
        if (res.status !== 404 && res.status !== 405) {
          this.logger.warn(`OpenWA ${ep.split('/').pop()} (base64) → ${res.status}: ${resBody.slice(0, 120)}`);
        }
      } catch (err) {
        this.logger.warn(`OpenWA image fetch error: ${(err as Error)?.message}`);
      }
    }

    return false;
  }

  /** Sent to the candidate when a PAN / Crime check is initiated. */
  async sendCheckStarted(
    phone: string,
    name: string,
    checkLabel: string,
  ): Promise<boolean> {
    const firstName = name.split(' ')[0] || name;
    const text =
      `Hi ${firstName},\n\n` +
      `A *${checkLabel}* verification has been started on your Assurio account.\n\n` +
      `No action is needed from you right now. You'll be notified once the report is ready.\n\n` +
      `_The Assurio Team_`;
    return this.send(phone, text);
  }

  /** Send any custom message — used by payments controller for receipts. */
  async sendRaw(phone: string, text: string): Promise<boolean> {
    return this.send(phone, text);
  }

  /**
   * Sent to the CLIENT when they add a new candidate.
   * Summarises candidate details so the client has a record.
   */
  async sendCandidateCreated(
    clientPhone: string,
    clientName: string,
    candidate: {
      name: string;
      role?: string;
      email: string;
      phone?: string;
    },
  ): Promise<boolean> {
    const firstName = clientName.split(' ')[0] || clientName;
    const roleStr = candidate.role || 'Not specified';
    const phoneStr = candidate.phone || 'Not provided';
    const text =
      `Hi ${firstName} 👋\n\n` +
      `A new candidate has been added to your *Assurio* account.\n\n` +
      `👤 *${candidate.name}*\n` +
      `Role: ${roleStr}\n` +
      `Email: ${candidate.email}\n` +
      `Phone: ${phoneStr}\n\n` +
      `Background verification is now in progress. You'll be notified when checks are complete.\n\n` +
      `_The Assurio Team_`;
    return this.send(clientPhone, text);
  }

  /**
   * Sent to the CLIENT when the crime check report is saved.
   * Formats the crimeResult JSON into a readable summary.
   */
  async sendCrimeReport(
    clientPhone: string,
    candidateName: string,
    crimeResult: Record<string, unknown>,
  ): Promise<boolean> {
    // Extract common KonnectNxt fields — handle both snake_case and camelCase variants
    const riskRaw =
      (crimeResult.risk_level ?? crimeResult.riskLevel ?? crimeResult.risk ?? '') as string;
    const riskLevel = String(riskRaw).toUpperCase() || 'UNKNOWN';
    const totalCases =
      crimeResult.total_cases ?? crimeResult.totalCases ?? crimeResult.cases_count ?? null;
    const status =
      (crimeResult.status ?? crimeResult.verdict ?? '') as string;

    const riskEmoji =
      riskLevel === 'HIGH' ? '🔴' :
      riskLevel === 'MEDIUM' ? '🟡' :
      riskLevel === 'LOW' || riskLevel === 'CLEAR' ? '🟢' : '⚪';

    let text =
      `📋 *Crime Check Report — ${candidateName}*\n\n` +
      `${riskEmoji} Risk Level: *${riskLevel}*\n`;

    if (status) {
      text += `Status: ${status}\n`;
    }
    if (totalCases !== null) {
      text += `Cases found: ${totalCases}\n`;
    }

    text +=
      `\nView full details in your Assurio dashboard.\n\n` +
      `_The Assurio Team_`;

    return this.send(clientPhone, text);
  }

  /**
   * Sent to the CLIENT after a successful payment.
   * Sends the invoice as a PDF document attachment.
   */
  async sendInvoicePdf(
    clientPhone: string,
    pdfBuffer: Buffer,
    invoiceNumber: string,
    caption: string,
    fileUrl?: string, // S3 presigned URL — passed so OpenWA fetches it directly
  ): Promise<boolean> {
    const filename = `invoice-${invoiceNumber}.pdf`;
    return this.sendDocument(clientPhone, pdfBuffer, filename, caption, fileUrl);
  }

  /**
   * Sent to the CLIENT when the crime check report is ready.
   * Sends the report as a PDF document attachment.
   */
  async sendCrimeReportPdf(
    clientPhone: string,
    pdfBuffer: Buffer,
    candidateName: string,
  ): Promise<boolean> {
    const safe = candidateName.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/ /g, '-') || 'candidate';
    const filename = `crime-report-${safe}.pdf`;
    const caption = `📋 Crime check report for *${candidateName}* is ready.`;
    return this.sendDocument(clientPhone, pdfBuffer, filename, caption);
  }

  /**
   * Send a document via OpenWA.
   *
   * Strategy (avoids HTTP 413 "request entity too large"):
   *   1. If a public fileUrl is supplied, try OpenWA's URL-based endpoint so
   *      OpenWA fetches the file itself — request body stays tiny (~200 B).
   *   2. Fall back to the base64 endpoint (works for small files / no S3).
   */
  async sendDocument(
    rawPhone: string,
    fileBuffer: Buffer,
    filename: string,
    caption?: string,
    fileUrl?: string, // optional S3 / public URL — used to avoid 413
  ): Promise<boolean> {
    const base = process.env.OPENWA_URL?.replace(/\/$/, '');
    const session = process.env.OPENWA_SESSION;
    const apiKey = process.env.OPENWA_API_KEY;

    if (!base || !session) {
      this.logger.warn('OPENWA_URL / OPENWA_SESSION not set — WhatsApp document skipped.');
      return false;
    }

    const chatId = this.toChatId(rawPhone);
    if (!chatId) {
      this.logger.warn(`WhatsApp document skipped — could not normalise phone "${rawPhone}".`);
      return false;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;

    const sessionId = await this.resolveSessionId(base, session, headers);
    if (!sessionId) {
      this.logger.error(`Could not resolve session "${session}" — document not sent.`);
      return false;
    }

    const sid = encodeURIComponent(sessionId);

    const docEndpoint = `${base}/sessions/${sid}/messages/send-document`;

    // ── Strategy 1: dedicated URL endpoints (body stays tiny) ──────────
    if (fileUrl) {
      const urlBodies = [
        // Some forks expose send-file-from-url
        { ep: `${base}/sessions/${sid}/messages/send-file-from-url`, body: JSON.stringify({ chatId, url: fileUrl, filename, caption: caption || '', mimetype: 'application/pdf' }) },
        // Others expose send-file
        { ep: `${base}/sessions/${sid}/messages/send-file`,          body: JSON.stringify({ chatId, url: fileUrl, filename, caption: caption || '', mimetype: 'application/pdf' }) },
      ];
      for (const { ep, body } of urlBodies) {
        try {
          const res = await fetch(ep, { method: 'POST', headers, body });
          if (res.ok) {
            this.logger.log(`WhatsApp document "${filename}" sent via URL to ${chatId}`);
            return true;
          }
          if (res.status !== 404 && res.status !== 405) {
            this.logger.warn(`URL endpoint ${ep} returned ${res.status}`);
          }
        } catch { /* try next */ }
      }

      // ── Strategy 2: pass the URL as the `base64` field ───────────────
      // @open-wa/wa-automate's dataURL() helper detects https:// and downloads
      // the file on the server side — no large body sent from us.
      try {
        const res = await fetch(docEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ chatId, base64: fileUrl, mimetype: 'application/pdf', filename, caption: caption || '' }),
        });
        if (res.ok) {
          this.logger.log(`WhatsApp document "${filename}" sent via URL-as-base64 to ${chatId}`);
          return true;
        }
        const body = await res.text().catch(() => '');
        if (res.status === 400 && body.includes('not active')) {
          this.resolvedSessionId = null; // bust cache so next call re-resolves after reconnect
          this.logger.warn('OpenWA session inactive — reconnect in the OpenWA dashboard then retry.');
          return false; // no point trying base64 with an inactive session
        }
        if (res.status !== 413) {
          this.logger.warn(`URL-as-base64 to ${chatId} failed (${res.status}): ${body}`);
        }
        // 413 means server didn't handle URL — fall through to actual base64
      } catch { /* fall through */ }
    }

    // ── Strategy 3: actual base64 (last resort — may 413 on large files) ─
    const base64 = fileBuffer.toString('base64');
    try {
      const res = await fetch(docEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ chatId, base64, mimetype: 'application/pdf', filename, caption: caption || '' }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.error(`OpenWA send-document to ${chatId} failed (HTTP ${res.status}): ${body}`);
        return false;
      }

      this.logger.log(`WhatsApp document "${filename}" sent (base64) to ${chatId}`);
      return true;
    } catch (err) {
      this.logger.error(`OpenWA document fetch error: ${(err as Error)?.message ?? String(err)}`);
      return false;
    }
  }

  /* ── HTML templates for PDF documents ────────────────────────── */

  /**
   * Generates print-ready HTML for a crime check report PDF.
   * The crimeResult JSON from KonnectNxt is formatted into a clean layout.
   */
  renderCrimeReportHtml(candidateName: string, crimeResult: Record<string, unknown>): string {
    const esc = (s: unknown) =>
      String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const riskRaw = String(
      crimeResult.risk_level ?? crimeResult.riskLevel ?? crimeResult.risk ?? '',
    ).toUpperCase();
    const riskLabel = riskRaw || 'UNKNOWN';
    const riskType = String((crimeResult.risk_type ?? crimeResult.riskType ?? riskRaw) || '—');
    const totalCases = crimeResult.total_cases ?? crimeResult.totalCases ?? crimeResult.cases_count ?? null;
    const status = String(crimeResult.status ?? crimeResult.verdict ?? '—');

    const riskColor =
      riskLabel === 'HIGH' ? '#9c3936' :
      riskLabel === 'MEDIUM' ? '#b3771e' :
      riskLabel === 'LOW' || riskLabel === 'CLEAR' ? '#2f6649' : '#6b6157';
    const riskBg =
      riskLabel === 'HIGH' ? '#f1dcd6' :
      riskLabel === 'MEDIUM' ? '#f3e4c5' :
      riskLabel === 'LOW' || riskLabel === 'CLEAR' ? '#e7ecda' : '#f3ecdc';

    const now = new Date().toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });

    // Build detail rows from the data array if present
    const dataArr = Array.isArray(crimeResult.data) ? (crimeResult.data as Record<string, unknown>[]) : [];
    const caseRows = dataArr.slice(0, 20).map((c, i) => {
      const cName = esc(c.name ?? c.defendant_name ?? c.person_name ?? `Case ${i + 1}`);
      const cType = esc(c.case_type ?? c.offense_type ?? c.category ?? c.type ?? '—');
      const cYear = esc(c.year ?? c.filing_year ?? c.date ?? '—');
      const cCourt = esc(c.court ?? c.court_name ?? c.state ?? '—');
      return `<tr>
        <td>${i + 1}</td>
        <td>${cName}</td>
        <td>${cType}</td>
        <td>${cYear}</td>
        <td>${cCourt}</td>
      </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<title>Crime Check Report · ${esc(candidateName)}</title>
<style>
  :root { --ink:#1a1612; --ink-2:#6b6157; --ink-3:#948776; --rule:#e0d4bb; --paper:#f3ecdc; --card:#fbf6e9; }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;background:var(--paper);}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased;padding:32px 24px;}
  .wrap{max-width:720px;margin:0 auto;background:var(--card);border:1px solid var(--rule);border-radius:18px;padding:36px 36px 40px;}
  header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:1px solid var(--rule);margin-bottom:24px;}
  .brand{display:flex;align-items:center;gap:12px;}
  .brand-mark{width:36px;height:36px;border-radius:10px;background:var(--ink);color:var(--paper);display:flex;align-items:center;justify-content:center;font-family:'Times New Roman',serif;font-weight:500;font-size:16px;}
  .brand-name{font-family:'Times New Roman',serif;font-size:20px;font-weight:500;letter-spacing:-0.01em;}
  .brand-sub{font-size:10.5px;color:var(--ink-2);margin-top:1px;letter-spacing:0.04em;}
  .doc-label{font-size:10.5px;letter-spacing:0.14em;text-transform:uppercase;color:var(--ink-2);}
  .doc-title{font-family:'Times New Roman',serif;font-size:20px;font-weight:500;margin-top:2px;}
  .doc-date{font-size:11.5px;color:var(--ink-2);margin-top:3px;}
  /* Summary strip */
  .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px;}
  .s-box{background:var(--paper);border:1px solid var(--rule);border-radius:12px;padding:14px 16px;}
  .s-label{font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-2);margin-bottom:6px;}
  .s-val{font-family:'Times New Roman',serif;font-size:20px;font-weight:500;color:var(--ink);}
  .s-sub{font-size:11px;color:var(--ink-2);margin-top:2px;}
  /* Risk badge */
  .risk-pill{display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;background:${riskBg};color:${riskColor};border:1px solid ${riskColor}44;}
  /* Candidate info */
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:24px;}
  .info-row{display:flex;flex-direction:column;gap:2px;}
  .info-label{font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-2);}
  .info-val{font-family:'Times New Roman',serif;font-size:13.5px;font-weight:500;color:var(--ink);}
  /* Section */
  .section-title{font-size:10.5px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--ink-2);margin:0 0 10px;}
  /* Table */
  table{width:100%;border-collapse:collapse;}
  th{text-align:left;font-size:9.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-2);padding:8px 10px;background:var(--paper);border-bottom:1px solid var(--rule);}
  td{padding:10px 10px;border-bottom:1px solid var(--rule);font-size:12px;color:var(--ink);}
  tr:last-child td{border-bottom:none;}
  .no-cases{text-align:center;padding:28px;color:var(--ink-2);font-size:13px;font-style:italic;}
  .footer{margin-top:28px;padding-top:16px;border-top:1px solid var(--rule);font-size:10.5px;color:var(--ink-2);text-align:center;line-height:1.6;}
  @media print{
    *{-webkit-print-color-adjust:exact;color-adjust:exact;}
    body{background:#fff!important;padding:0!important;}
    .wrap{border:none!important;border-radius:0!important;background:#fff!important;padding:0!important;}
    .risk-badge{border:2px solid currentColor!important;background:transparent!important;}
    th{background:transparent!important;border-top:1px solid #1a1612!important;border-bottom:2px solid #1a1612!important;}
    .footer{border-top:1px solid #ccc!important;color:#555!important;}
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">
      <span class="brand-mark">A</span>
      <div>
        <div class="brand-name">Assurio</div>
        <div class="brand-sub">Consent-first background checks</div>
      </div>
    </div>
    <div style="text-align:right">
      <div class="doc-label">Crime Check Report</div>
      <div class="doc-title">${esc(candidateName)}</div>
      <div class="doc-date">Generated ${esc(now)}</div>
    </div>
  </header>

  <div class="summary">
    <div class="s-box">
      <div class="s-label">Risk Level</div>
      <span class="risk-pill">${esc(riskLabel)}</span>
      <div class="s-sub">${esc(riskType)}</div>
    </div>
    <div class="s-box">
      <div class="s-label">Cases Found</div>
      <div class="s-val">${totalCases !== null ? esc(totalCases) : '—'}</div>
      <div class="s-sub">total records</div>
    </div>
    <div class="s-box">
      <div class="s-label">Status</div>
      <div class="s-val" style="font-size:15px">${esc(status)}</div>
    </div>
  </div>

  ${dataArr.length > 0 ? `
  <div class="section-title">Case details</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Name</th>
        <th>Offense / Type</th>
        <th>Year</th>
        <th>Court / State</th>
      </tr>
    </thead>
    <tbody>${caseRows}</tbody>
  </table>
  ` : `<div class="no-cases">✅ No criminal records found for this individual.</div>`}

  <div class="footer">
    Assurio · Background verification infrastructure.<br />
    This report is sourced from publicly available court records via KonnectNxt.<br />
    Generated on ${esc(now)} · For client use only.
  </div>
</div>
</body>
</html>`;
  }

  /**
   * Send an image (already base64-encoded) with a caption.
   * Used by the admin WhatsApp sender page for image uploads.
   */
  async sendImageBase64(
    rawPhone: string,
    base64: string,
    mimetype: string,
    filename: string,
    caption: string,
  ): Promise<boolean> {
    const base = process.env.OPENWA_URL?.replace(/\/$/, '');
    const session = process.env.OPENWA_SESSION;
    const apiKey = process.env.OPENWA_API_KEY;
    if (!base || !session) return false;

    const chatId = this.toChatId(rawPhone);
    if (!chatId) return false;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;

    const sessionId = await this.resolveSessionId(base, session, headers);
    if (!sessionId) return false;

    const sid = encodeURIComponent(sessionId);
    // Send raw base64 (no data URI prefix) — OpenWA wants mimetype as a separate field
    const rawB64 = base64.startsWith('data:') ? base64.split(',')[1] : base64;

    for (const ep of [
      `${base}/sessions/${sid}/messages/send-image`,
      `${base}/sessions/${sid}/messages/send-document`,
    ]) {
      try {
        const res = await fetch(ep, {
          method: 'POST', headers,
          body: JSON.stringify({ chatId, base64: rawB64, mimetype, filename, caption }),
        });
        if (res.ok) { this.logger.log(`Image sent to ${chatId} via ${ep.split('/').pop()}`); return true; }
        const rb = await res.text().catch(() => '');
        if (res.status === 400 && rb.includes('not active')) { this.resolvedSessionId = null; return false; }
        if (res.status !== 404 && res.status !== 405) {
          this.logger.warn(`${ep.split('/').pop()} → ${res.status}: ${rb.slice(0, 100)}`);
        }
      } catch { /* try next */ }
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /*  Number lookup                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Returns true if the number is registered on WhatsApp, false if not,
   * null if the check could not be performed (session offline / env missing).
   */
  async checkNumber(rawPhone: string): Promise<boolean | null> {
    const base = process.env.OPENWA_URL?.replace(/\/$/, '');
    const session = process.env.OPENWA_SESSION;
    const apiKey = process.env.OPENWA_API_KEY;
    if (!base || !session) return null;

    const chatId = this.toChatId(rawPhone);
    if (!chatId) return null;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;

    const sessionId = await this.resolveSessionId(base, session, headers);
    if (!sessionId) return null;

    const sid = encodeURIComponent(sessionId);

    // This OpenWA fork exposes GET /contacts/{chatId}/profile-picture
    // which returns { url: string } for numbers on WhatsApp, { url: null } for those that aren't.
    const picUrl = `${base}/sessions/${sid}/contacts/${encodeURIComponent(chatId)}/profile-picture`;
    try {
      const res = await fetch(picUrl, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        const rb = await res.text().catch(() => '');
        if (res.status === 400 && rb.includes('not active')) this.resolvedSessionId = null;
        return null;
      }
      const data = await res.json().catch(() => null);
      if (data === null) return null;
      return data.url !== null && data.url !== undefined && data.url !== '';
    } catch (err) {
      this.logger.warn(`checkNumber fetch error: ${(err as Error)?.message}`);
      return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Transport                                                           */
  /* ------------------------------------------------------------------ */

  private async send(rawPhone: string, text: string): Promise<boolean> {
    const base = process.env.OPENWA_URL?.replace(/\/$/, '');
    const session = process.env.OPENWA_SESSION;
    const apiKey = process.env.OPENWA_API_KEY; // optional when self-hosting

    if (!base || !session) {
      this.logger.warn(
        'OPENWA_URL / OPENWA_SESSION not set — WhatsApp skipped.',
      );
      return false;
    }

    const chatId = this.toChatId(rawPhone);
    if (!chatId) {
      this.logger.warn(
        `WhatsApp skipped — could not normalise phone number "${rawPhone}".`,
      );
      return false;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;

    // OpenWA routes by UUID, not name — resolve once and cache
    const sessionId = await this.resolveSessionId(base, session, headers);
    if (!sessionId) {
      this.logger.error(`Could not resolve session "${session}" to a UUID — is the session connected in OpenWA?`);
      return false;
    }

    const url = `${base}/sessions/${encodeURIComponent(sessionId)}/messages/send-text`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ chatId, text }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        // If the session is inactive, clear the cache so the next call re-resolves
        // the UUID after the user reconnects in the OpenWA dashboard.
        if (res.status === 400 && body.includes('not active')) {
          this.resolvedSessionId = null;
          this.logger.warn(
            `OpenWA session inactive — reconnect in the OpenWA dashboard then retry.`,
          );
        } else {
          this.logger.error(
            `OpenWA send to ${chatId} failed (HTTP ${res.status}): ${body}`,
          );
        }
        return false;
      }

      this.logger.log(`WhatsApp sent to ${chatId}`);
      return true;
    } catch (err) {
      this.logger.error(
        `OpenWA fetch error: ${(err as Error)?.message ?? String(err)}`,
      );
      return false;
    }
  }

  /**
   * OpenWA's message routes require the session UUID, not the human name.
   * If OPENWA_SESSION is already a UUID it passes through unchanged.
   * Otherwise we call GET /sessions, find the matching entry by name, and
   * cache the UUID for the lifetime of this process.
   */
  private async resolveSessionId(
    base: string,
    session: string,
    headers: Record<string, string>,
  ): Promise<string | null> {
    // Already looks like a UUID — use as-is
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRe.test(session)) return session;

    // Return cached value
    if (this.resolvedSessionId) return this.resolvedSessionId;

    try {
      const res = await fetch(`${base}/sessions`, { headers });
      if (!res.ok) return null;
      const list = (await res.json()) as Array<{ id: string; name: string }>;
      const match = list.find(
        (s) => s.name === session || s.id === session,
      );
      if (match) {
        this.resolvedSessionId = match.id;
        this.logger.log(`Resolved session "${session}" → ${match.id}`);
        return match.id;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Converts a raw phone string to an OpenWA chatId (`{digits}@c.us`).
   *
   * Rules (for India default, overridable via OPENWA_COUNTRY_CODE):
   *   - Strip all non-digit characters
   *   - If the number starts with a leading 0, replace it with the country code
   *   - If the number has fewer digits than expected with country code, prepend code
   *   - Append @c.us
   */
  private toChatId(raw: string): string | null {
    if (!raw) return null;

    const countryCode = (process.env.OPENWA_COUNTRY_CODE || '91').replace(
      /^\+/,
      '',
    );

    const digits = raw.replace(/\D/g, '');
    if (!digits) return null;

    let normalised = digits;

    // Leading 0 → replace with country code (e.g. 09876543210 → 919876543210)
    if (normalised.startsWith('0')) {
      normalised = countryCode + normalised.slice(1);
    }

    // If number doesn't start with country code, prepend it
    if (!normalised.startsWith(countryCode)) {
      normalised = countryCode + normalised;
    }

    // Sanity: must be at least 10 digits total
    if (normalised.length < 10) return null;

    return `${normalised}@c.us`;
  }
}
