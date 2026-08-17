import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WhatsAppService } from './whatsapp.service';

interface RequestWithUser extends Request {
  user?: { sub?: string; role?: string };
}

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  @UseGuards(JwtAuthGuard)
  @Get('check/:phone')
  async checkNumber(@Req() req: RequestWithUser, @Param('phone') phone: string) {
    if (req.user?.role !== 'admin') throw new ForbiddenException('Admin only');
    if (!phone) throw new BadRequestException('phone is required');
    const result = await this.whatsapp.checkNumber(phone);
    return { phone, onWhatsApp: result };
  }

  @Post('send')
  async send(@Body() body: { phone?: string; message?: string }) {
    const phone = (body.phone || '').trim();
    const message = (body.message || '').trim();

    if (!phone) throw new BadRequestException('phone is required');
    if (!message) throw new BadRequestException('message is required');

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

    const filename = (body.filename || 'document.pdf').trim();
    const caption = (body.caption || '').trim();
    const buffer = Buffer.from(b64, 'base64');
    const sent = await this.whatsapp.sendDocument(phone, buffer, filename, caption || undefined);
    return { ok: sent };
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

    const mimetype = (body.mimetype || 'image/jpeg').trim();
    const filename = (body.filename || 'image.jpg').trim();
    const caption = (body.caption || '').trim();

    // Send as image with caption using the image endpoint
    const sent = await this.whatsapp.sendImageBase64(phone, b64, mimetype, filename, caption);
    return { ok: sent };
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
      'https://assurio.com'
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
