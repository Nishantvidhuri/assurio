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
  CreditCheckDto,
  CrimeCheckDto,
  DrivingLicenseCheckDto,
  EmploymentHistoryDto,
  PanCheckDto,
  PassportCheckDto,
  VoterIdCheckDto,
} from './dto';
import { VerifyService } from './verify.service';

// Every entry starts with a dot so `host.endsWith(suffix)` can only match a
// subdomain — bare 'surepass.app' would also match 'evilsurepass.app'.
const ALLOWED_PDF_HOST_SUFFIXES = [
  '.getupforchange.com',
  '.dcourts.gov.in',
  '.ecourts.gov.in',
  '.surepass.app',
  '.surepass.io',
  '.notbot.in',
];

/**
 * Hosts matched exactly, for sources that serve from an apex rather than a
 * subdomain. KonnectNxt's BGV reports live in a Google Cloud Storage bucket,
 * so the host is storage.googleapis.com itself — it cannot go in the suffix
 * list above, where a bare entry would also match 'notstorage.googleapis.com'.
 */
const ALLOWED_PDF_HOSTS = ['storage.googleapis.com'];

/**
 * Path prefixes required per exact host. Allowing all of GCS would turn this
 * proxy into a fetcher for any public bucket on the internet; the report
 * objects all live under /konnectnxt/, so scope it there.
 */
const ALLOWED_PDF_HOST_PATHS: Record<string, string> = {
  'storage.googleapis.com': '/konnectnxt/',
};

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

  /* ── KonnectNxt: Credit report (v2 BGV) ── */

  @Post('credit-check')
  creditCheck(@Body() dto: CreditCheckDto) {
    return this.verify.creditCheck(dto);
  }

  @Get('credit-check/:caseId')
  creditCheckReport(@Param('caseId') caseId: string) {
    return this.verify.creditCheckReport(caseId);
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
    const requiredPath = ALLOWED_PDF_HOST_PATHS[host];
    const allowed =
      ALLOWED_PDF_HOST_SUFFIXES.some((suf) => host.endsWith(suf)) ||
      (ALLOWED_PDF_HOSTS.includes(host) &&
        (!requiredPath || parsed.pathname.startsWith(requiredPath)));
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
