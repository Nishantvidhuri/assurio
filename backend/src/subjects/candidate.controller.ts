import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Patch,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DraftService } from '../draft/draft.service';
import { toSubjectResponse } from './subject-response';
import { SubjectPatch, SubjectsService } from './subjects.service';

interface RequestWithUser extends Request {
  user?: { sub?: string; role?: string };
}

/** Fields a logged-in candidate may update on their own record. */
const CANDIDATE_PATCH_FIELDS: ReadonlyArray<keyof SubjectPatch> = [
  'panFront',
  'panBack',
  'panNumber',
  'panResult',
  'aadhaarFront',
  'aadhaarBack',
  'aadhaarNumber',
  'aadhaarResult',
  'digilockerClientId',
  'digilockerUrl',
  'consentResult',
  'status',
];

@Controller('candidate')
@UseGuards(JwtAuthGuard)
export class CandidateController {
  constructor(
    private readonly svc: SubjectsService,
    private readonly draft: DraftService,
  ) {}

  /** The logged-in candidate's own verification record. */
  @Get('me')
  async me(@Req() req: RequestWithUser) {
    const id = this.requireCandidate(req);
    const doc = await this.svc.findById(id);
    if (!doc) throw new NotFoundException('Record not found');
    return toSubjectResponse(doc);
  }

  /** Candidate saves PAN images / DigiLocker progress on their record. */
  @Patch('me')
  async patch(
    @Req() req: RequestWithUser,
    @Body() body: Record<string, unknown>,
  ) {
    const id = this.requireCandidate(req);
    const patch: SubjectPatch = {};
    for (const key of Object.keys(body)) {
      if (CANDIDATE_PATCH_FIELDS.includes(key as keyof SubjectPatch)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (patch as any)[key] = body[key];
      }
    }
    const doc = await this.svc.patchOwn(id, patch);
    return toSubjectResponse(doc);
  }

  /** Save a pending draft (debounced from the client, committed after 20 s of inactivity). */
  @Put('me/draft')
  async saveDraft(
    @Req() req: RequestWithUser,
    @Body() body: Record<string, unknown>,
  ) {
    const id = this.requireCandidate(req);
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (CANDIDATE_PATCH_FIELDS.includes(key as keyof SubjectPatch)) {
        patch[key] = body[key];
      }
    }
    await this.draft.save(id, patch);
    return { ok: true };
  }

  /** Return the current pending draft so the form can be restored on reload. */
  @Get('me/draft')
  async getDraft(@Req() req: RequestWithUser) {
    const id = this.requireCandidate(req);
    const d = await this.draft.get(id);
    return d ? { patch: d.patch, updatedAt: d.updatedAt } : null;
  }

  /** Discard the draft (e.g. when the candidate explicitly submits). */
  @Delete('me/draft')
  async deleteDraft(@Req() req: RequestWithUser) {
    const id = this.requireCandidate(req);
    await this.draft.discard(id);
    return { ok: true };
  }

  private requireCandidate(req: RequestWithUser): string {
    if (req.user?.role !== 'candidate') {
      throw new ForbiddenException('Candidate access required');
    }
    const id = req.user?.sub;
    if (!id) throw new BadRequestException('Missing candidate');
    return id;
  }
}
