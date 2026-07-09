import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CrimeCheckDto,
  DrivingLicenseCheckDto,
  EmploymentHistoryDto,
  PanCheckDto,
  PassportCheckDto,
  VoterIdCheckDto,
} from './dto';
import { VerifyService } from './verify.service';

const ALLOWED_PDF_HOST_SUFFIXES = [
  '.getupforchange.com',
  '.dcourts.gov.in',
  '.ecourts.gov.in',
  '.surepass.app',
  '.surepass.io',
  '.notbot.in',
];

@Controller('verify')
@UseGuards(JwtAuthGuard)
export class VerifyController {
  constructor(private readonly verify: VerifyService) {}

  /* ── Surepass ── */

  @Post('pan')
  pan(@Body() dto: PanCheckDto) {
    return this.verify.pan(dto.idNumber.toUpperCase());
  }

  @Post('voter-id')
  voterId(@Body() dto: VoterIdCheckDto) {
    return this.verify.voterId(dto.idNumber.toUpperCase());
  }

  @Post('passport')
  passport(@Body() dto: PassportCheckDto) {
    return this.verify.passport(dto.fileNumber.toUpperCase(), dto.dob);
  }

  @Post('driving-license')
  drivingLicense(@Body() dto: DrivingLicenseCheckDto) {
    return this.verify.drivingLicense(dto.idNumber.toUpperCase(), dto.dob);
  }

  @Post('employment-history')
  employmentHistory(@Body() dto: EmploymentHistoryDto) {
    return this.verify.employmentHistory(dto.uan);
  }

  @Post('digilocker/initialize')
  digilockerInitialize() {
    return this.verify.digilockerInitialize();
  }

  @Get('digilocker/status/:clientId')
  digilockerStatus(@Param('clientId') clientId: string) {
    return this.verify.digilockerStatus(clientId);
  }

  @Get('digilocker/aadhaar/:clientId')
  digilockerAadhaar(@Param('clientId') clientId: string) {
    return this.verify.digilockerAadhaar(clientId);
  }

  /* ── KonnectNxt ── */

  @Post('crime-check')
  crimeCheck(@Body() dto: CrimeCheckDto) {
    return this.verify.crimeCheck(dto);
  }

  @Get('crime-check/:requestId')
  crimeCheckReport(@Param('requestId') requestId: string) {
    return this.verify.crimeCheckReport(requestId);
  }

  /* ── PDF proxy ── */

  // Proxy a PDF from a trusted upstream so the browser can render it inline.
  // KonnectNxt / eCourts URLs respond with Content-Disposition: attachment,
  // which forces a download in iframes. We rewrite that header to "inline".
  @Get('pdf')
  async pdfProxy(
    @Query('url') url: string,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    if (!url) {
      res.status(400).json({ message: 'Missing url parameter' });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      res.status(400).json({ message: 'Invalid URL' });
      return;
    }

    const host = parsed.hostname.toLowerCase();
    const allowed = ALLOWED_PDF_HOST_SUFFIXES.some((suf) => host.endsWith(suf));
    if (!allowed) {
      res.status(403).json({ message: `Domain ${host} is not allowed for preview` });
      return;
    }

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(url);
    } catch {
      res.status(502).json({ message: 'Could not reach the PDF source' });
      return;
    }

    if (!upstream.ok) {
      res.status(502).json({ message: `Upstream returned HTTP ${upstream.status}` });
      return;
    }

    const contentType = upstream.headers.get('content-type') || 'application/pdf';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  }
}
