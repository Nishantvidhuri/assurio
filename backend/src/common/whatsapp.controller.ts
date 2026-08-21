import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WhatsAppService } from './whatsapp.service';
import { waScenarios } from './whatsapp-test-scenarios';

interface RequestWithUser extends Request {
  user?: { sub?: string; role?: string };
}

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  /** Server-side gate: refuse any target that isn't a candidate/client. */
  private async assertPlatformTarget(phone: string): Promise<void> {
    if (!(await this.whatsapp.isPlatformTarget(phone))) {
      throw new ForbiddenException(
        'You can only message your own candidates or clients.',
      );
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('check/:phone')
  async checkNumber(@Req() req: RequestWithUser, @Param('phone') phone: string) {
    if (req.user?.role !== 'admin') throw new ForbiddenException('Admin only');
    if (!phone) throw new BadRequestException('phone is required');
    const result = await this.whatsapp.checkNumber(phone);
    return { phone, onWhatsApp: result };
  }

  /** All conversations for the session — powers the chat-list pane. */
  @UseGuards(JwtAuthGuard)
  @Get('chats')
  async chats(@Req() req: RequestWithUser, @Query('limit') limit?: string) {
    if (req.user?.role !== 'admin') throw new ForbiddenException('Admin only');
    // Always candidate/client-only — enforced in the service, no opt-out.
    const [chats, contacts] = await Promise.all([
      this.whatsapp.getChats(
        limit ? Math.min(Math.max(Number(limit) || 100, 1), 200) : 100,
      ),
      // Every candidate/client/draft we hold a number for, so contacts with no
      // conversation yet still appear in the list and can be opened.
      this.whatsapp.knownPlatformContacts(),
    ]);
    // WhatsApp doesn't always create a chat entry for a thread we've only sent
    // into, so fold those in — otherwise a candidate we messaged shows as
    // "no conversation yet" right under the message we sent them.
    const outboundOnly = chats
      ? await this.whatsapp.findOutboundOnlyThreads(contacts, chats)
      : [];
    const merged = [...(chats ?? []), ...outboundOnly].sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
    );
    return { configured: chats !== null, chats: merged, contacts };
  }

  /** Conversation (sent + received) with a number — powers the chat view. */
  @UseGuards(JwtAuthGuard)
  @Get('messages/:phone')
  async messages(
    @Req() req: RequestWithUser,
    @Param('phone') phone: string,
    @Query('limit') limit?: string,
  ) {
    if (req.user?.role !== 'admin') throw new ForbiddenException('Admin only');
    if (!phone) throw new BadRequestException('phone is required');
    const messages = await this.whatsapp.getMessages(
      phone,
      limit ? Math.min(Math.max(Number(limit) || 50, 1), 200) : 50,
    );
    return { phone, configured: messages !== null, messages: messages ?? [] };
  }

  /**
   * Streams a message's stored media (image/pdf) so the chat view can render
   * real thumbnails. Guarded to platform chats in the service. chatId/messageId
   * are passed as query params (WhatsApp ids contain "@" and can hold slashes).
   */
  @UseGuards(JwtAuthGuard)
  @Get('media')
  async media(
    @Req() req: RequestWithUser,
    @Res() res: Response,
    @Query('chatId') chatId?: string,
    @Query('messageId') messageId?: string,
  ) {
    if (req.user?.role !== 'admin') throw new ForbiddenException('Admin only');
    if (!chatId || !messageId) {
      throw new BadRequestException('chatId and messageId are required');
    }
    const media = await this.whatsapp.getMessageMedia(chatId, messageId);
    if (!media) throw new NotFoundException('Media not available');
    res.setHeader('Content-Type', media.mimetype);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(media.buffer);
  }

  @UseGuards(JwtAuthGuard)
  @Post('send')
  async send(
    @Req() req: RequestWithUser,
    @Body() body: { phone?: string; message?: string },
  ) {
    if (req.user?.role !== 'admin') throw new ForbiddenException('Admin only');
    const phone = (body.phone || '').trim();
    const message = (body.message || '').trim();

    if (!phone) throw new BadRequestException('phone is required');
    if (!message) throw new BadRequestException('message is required');
    await this.assertPlatformTarget(phone);

    const sent = await this.whatsapp.sendRaw(phone, message);
    return { ok: sent };
  }

  /**
   * Sends the full branded verification invite (image + caption) to a number.
   * Used by the admin "Send Demo" tool to preview what candidates receive.
   */
  @UseGuards(JwtAuthGuard)
  @Post('send-pdf')
  async sendPdf(
    @Req() req: RequestWithUser,
    @Body() body: { phone?: string; base64?: string; filename?: string; caption?: string },
  ) {
    if (req.user?.role !== 'admin') throw new ForbiddenException('Admin only');
    const phone = (body.phone || '').trim();
    const b64 = (body.base64 || '').trim();
    if (!phone) throw new BadRequestException('phone is required');
    if (!b64) throw new BadRequestException('base64 is required');
    await this.assertPlatformTarget(phone);

    const filename = (body.filename || 'document.pdf').trim();
    const caption = (body.caption || '').trim();
    const buffer = Buffer.from(b64, 'base64');
    const { ok } = await this.whatsapp.sendMediaBuffer(
      phone,
      buffer,
      'application/pdf',
      filename,
      caption,
      'document',
    );
    return { ok };
  }

  @UseGuards(JwtAuthGuard)
  @Post('send-image')
  async sendImage(
    @Req() req: RequestWithUser,
    @Body() body: { phone?: string; base64?: string; mimetype?: string; filename?: string; caption?: string },
  ) {
    if (req.user?.role !== 'admin') throw new ForbiddenException('Admin only');
    const phone = (body.phone || '').trim();
    const b64 = (body.base64 || '').trim();
    if (!phone) throw new BadRequestException('phone is required');
    if (!b64) throw new BadRequestException('base64 is required');
    await this.assertPlatformTarget(phone);

    const mimetype = (body.mimetype || 'image/jpeg').trim();
    const filename = (body.filename || 'image.jpg').trim();
    const caption = (body.caption || '').trim();

    // Upload to S3 first, then send — so the chat re-renders it after refresh.
    const { ok } = await this.whatsapp.sendMediaBuffer(
      phone,
      Buffer.from(b64, 'base64'),
      mimetype,
      filename,
      caption,
      'image',
    );
    return { ok };
  }

  /**
   * The full catalog of lifecycle notifications with sample data — powers the
   * admin /whatsapptest page. Returns the exact text each one would deliver.
   */
  @UseGuards(JwtAuthGuard)
  @Get('scenarios')
  scenarios(@Req() req: RequestWithUser) {
    if (req.user?.role !== 'admin') throw new ForbiddenException('Admin only');
    return { scenarios: waScenarios() };
  }

  /**
   * Send one or more catalog scenarios to a number, for reviewing how each
   * condition actually looks in WhatsApp. Same platform-target guard as every
   * other send: candidates, clients and drafts only.
   */
  @UseGuards(JwtAuthGuard)
  @Post('scenarios/send')
  async sendScenarios(
    @Req() req: RequestWithUser,
    @Body() body: { phone?: string; ids?: string[] },
  ) {
    if (req.user?.role !== 'admin') throw new ForbiddenException('Admin only');
    const phone = (body.phone || '').trim();
    if (!phone) throw new BadRequestException('phone is required');
    await this.assertPlatformTarget(phone);

    const all = waScenarios();
    const wanted =
      body.ids && body.ids.length > 0
        ? all.filter((s) => body.ids!.includes(s.id))
        : all;
    if (wanted.length === 0) {
      throw new BadRequestException('No matching scenarios');
    }

    const results: Array<{ id: string; ok: boolean }> = [];
    for (const scenario of wanted) {
      const ok = await this.whatsapp.sendRaw(phone, scenario.text);
      results.push({ id: scenario.id, ok });
      // Space the sends out so WhatsApp keeps them in order and doesn't
      // rate-limit a burst.
      if (wanted.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
    return { sent: results.filter((r) => r.ok).length, results };
  }

  @UseGuards(JwtAuthGuard)
  @Post('demo-invite')
  async demoInvite(@Req() req: RequestWithUser, @Body() body: { phone?: string }) {
    if (req.user?.role !== 'admin') throw new ForbiddenException('Admin only');
    const phone = (body.phone || '').trim();
    if (!phone) throw new BadRequestException('phone is required');

    const publicBase = (
      process.env.PUBLIC_APP_URL ||
      process.env.APP_URL ||
      'https://recrify.in'
    ).replace(/\/$/, '');

    const sent = await this.whatsapp.sendVerificationStarted(
      phone,
      'Nishant Vidhuri',
      'recriauth.com',
      `${publicBase}/invite/demo`,
    );
    return { ok: sent };
  }
}
