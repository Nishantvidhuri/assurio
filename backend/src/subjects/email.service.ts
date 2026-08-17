import { Injectable, Logger } from '@nestjs/common';
import { BRAND } from '../common/brand-colors';

/**
 * Sends transactional email via the Resend HTTP API.
 * If RESEND_API_KEY is not configured it simply logs and skips —
 * the invite link is always also returned to the inviter to share manually.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  /* ------------------------------ Templates ------------------------------ */

  async sendInvite(
    to: string,
    name: string,
    inviteUrl: string,
  ): Promise<boolean> {
    const firstName = name.split(' ')[0] || name;
    const body = `
      <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:${BRAND.ink}">Hi ${this.esc(firstName)},</p>
      <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${BRAND.textBody}">
        You've been invited to complete a quick background verification on Assurio.
      </p>
      <p style="margin:0 0 36px;font-size:16px;line-height:1.6;color:${BRAND.textBody}">
        Tap the button below to set your password and get started — it only takes a minute.
      </p>
      ${this.button(inviteUrl, 'Set password & continue')}
      ${this.linkFallback(inviteUrl)}
      <p style="margin:40px 0 0;font-size:16px;line-height:1.6;color:${BRAND.ink}"><strong>The Assurio Team.</strong></p>
    `;
    return this.send(
      to,
      `Welcome to Assurio, ${this.esc(firstName)}`,
      this.wrap({
        preheader: 'Set your password and complete your Assurio verification.',
        heading: 'Welcome to Assurio',
        bodyHtml: body,
      }),
    );
  }

  async sendPasswordReset(
    to: string,
    name: string,
    resetUrl: string,
  ): Promise<boolean> {
    const firstName = name.split(' ')[0] || name;
    const body = `
      <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:${BRAND.ink}">Hi ${this.esc(firstName)},</p>
      <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${BRAND.textBody}">
        Tap the button below to reset your Assurio account password.
      </p>
      <p style="margin:0 0 36px;font-size:16px;line-height:1.6;color:${BRAND.textBody}">
        If you didn't request a new password, you can safely delete this email. This link is valid for 1 hour.
      </p>
      ${this.button(resetUrl, 'Reset Password')}
      ${this.linkFallback(resetUrl)}
      <p style="margin:40px 0 0;font-size:16px;line-height:1.6;color:${BRAND.ink}"><strong>The Assurio Team.</strong></p>
    `;
    return this.send(
      to,
      'Reset your Assurio password',
      this.wrap({
        preheader: 'Use this secure link to choose a new Assurio password.',
        heading: 'Reset Your Password',
        bodyHtml: body,
      }),
    );
  }

  async sendCheckStarted(
    to: string,
    name: string,
    checkLabel: string,
  ): Promise<boolean> {
    const firstName = name.split(' ')[0] || name;
    const body = `
      <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:${BRAND.ink}">Hi ${this.esc(firstName)},</p>
      <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${BRAND.textBody}">
        A <strong style="color:${BRAND.ink}">${this.esc(checkLabel)}</strong> verification has been started on your Assurio account.
      </p>
      <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${BRAND.textBody}">
        No action is needed from you right now. You'll be notified once the report is ready.
      </p>
      <p style="margin:0 0 0;font-size:16px;line-height:1.6;color:${BRAND.textBody}">
        If this looks unexpected, please contact the account holder who initiated the check.
      </p>
      <p style="margin:40px 0 0;font-size:16px;line-height:1.6;color:${BRAND.ink}"><strong>The Assurio Team.</strong></p>
    `;
    return this.send(
      to,
      `${checkLabel} verification started`,
      this.wrap({
        preheader: `A ${checkLabel} verification has been started on your Assurio account.`,
        heading: `${checkLabel} Verification Started`,
        bodyHtml: body,
      }),
    );
  }

  /** Emailed when a verification is started — sends the candidate to the public
   *  consent + details + Aadhaar (DigiLocker) flow at /verify/:token. */
  async sendVerificationLink(
    to: string,
    name: string,
    clientName: string,
    verifyUrl: string,
  ): Promise<boolean> {
    const firstName = name.split(' ')[0] || name;
    const body = `
      <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:${BRAND.ink}">Hi ${this.esc(firstName)},</p>
      <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${BRAND.textBody}">
        <strong style="color:${BRAND.ink}">${this.esc(clientName)}</strong> has started a background verification and needs your confirmation.
      </p>
      <p style="margin:0 0 36px;font-size:16px;line-height:1.6;color:${BRAND.textBody}">
        Please review and agree to the terms, confirm your details, and complete your Aadhaar verification — it only takes a minute.
      </p>
      ${this.button(verifyUrl, 'Start verification')}
      ${this.linkFallback(verifyUrl)}
      <p style="margin:40px 0 0;font-size:16px;line-height:1.6;color:${BRAND.ink}"><strong>The Assurio Team.</strong></p>
    `;
    return this.send(
      to,
      `${this.esc(clientName)} requested your verification on Assurio`,
      this.wrap({
        preheader: `${clientName} has started your background verification — complete it in a minute.`,
        heading: 'Complete your verification',
        bodyHtml: body,
      }),
    );
  }

  /* -------------------------- Layout & primitives ------------------------ */

  private wrap(args: {
    preheader: string;
    heading: string;
    bodyHtml: string;
  }): string {
    return [
      '<!DOCTYPE html>',
      '<html lang="en"><head><meta charset="utf-8" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      '<meta name="color-scheme" content="light only" />',
      '<meta name="supported-color-schemes" content="light only" />',
      `<title>${this.esc(args.heading)}</title>`,
      '</head>',
      `<body style="margin:0;padding:0;background:${BRAND.primaryTint};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${BRAND.ink};-webkit-font-smoothing:antialiased">`,
      `<span style="display:none;font-size:1px;color:${BRAND.primaryTint};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${this.esc(args.preheader)}</span>`,
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.primaryTint}">',
      '<tr><td align="center" style="padding:40px 16px">',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:14px;border:2px solid ${BRAND.borderSoft};overflow:hidden">',
      // top accent stripe
      '<tr><td style="height:4px;background:${BRAND.primary};font-size:0;line-height:0">&nbsp;</td></tr>',
      // content
      '<tr><td style="padding:48px 56px 56px">',
      `<h1 style="margin:0 0 28px;font-size:34px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;color:${BRAND.ink}">${this.esc(args.heading)}</h1>`,
      args.bodyHtml,
      '</td></tr>',
      // bottom accent stripe
      '<tr><td style="height:4px;background:${BRAND.primary};font-size:0;line-height:0">&nbsp;</td></tr>',
      '</table>',
      '<div style="max-width:600px;margin:14px auto 0;text-align:center;color:${BRAND.textDisabled};font-size:11.5px;line-height:1.5">Assurio · Consent-first background checks</div>',
      '</td></tr>',
      '</table>',
      '</body></html>',
    ].join('\n');
  }

  /** Bulletproof centered button (table-cell pattern). */
  private button(url: string, label: string): string {
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius:12px;background:${BRAND.primary}">
                  <a href="${this.attr(url)}"
                     style="display:inline-block;padding:18px 56px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;letter-spacing:-0.005em;color:#ffffff;text-decoration:none;border-radius:12px">
                    ${this.esc(label)}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
  }

  private linkFallback(url: string): string {
    return `
      <p style="margin:36px 0 0;font-size:14.5px;line-height:1.6;color:${BRAND.textMuted}">If that doesn't work, copy and paste the following link in your browser:</p>
      <p style="margin:6px 0 0;font-size:14.5px;line-height:1.55;word-break:break-all"><a href="${this.attr(url)}" style="color:${BRAND.primary};text-decoration:underline">${this.esc(url)}</a></p>
    `;
  }

  /** Minimal HTML escape for user-supplied strings interpolated into the template. */
  private esc(s: string): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Escape for use inside an href attribute (quotes only). */
  private attr(s: string): string {
    return String(s ?? '').replace(/"/g, '&quot;');
  }

  /* ------------------------------- Transport ----------------------------- */

  private async send(to: string, subject: string, html: string): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn(`RESEND_API_KEY not set — email to ${to} skipped.`);
      return false;
    }
    const from = process.env.EMAIL_FROM || 'Assurio <onboarding@resend.dev>';
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, html }),
      });
      if (!res.ok) {
        this.logger.error(`Resend email to ${to} failed (HTTP ${res.status})`);
        return false;
      }
      this.logger.log(`Email "${subject}" sent to ${to}`);
      return true;
    } catch (err) {
      this.logger.error(`Resend email error: ${(err as Error)?.message ?? err}`);
      return false;
    }
  }
}
