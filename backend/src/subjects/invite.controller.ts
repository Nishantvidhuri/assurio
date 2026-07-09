import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SubjectsService } from './subjects.service';

/** Public endpoints — the invited candidate has no session yet. */
@Controller('invite')
export class InviteController {
  constructor(
    private readonly svc: SubjectsService,
    private readonly jwt: JwtService,
  ) {}

  /** Validates an invite link and returns who it's for. */
  @Get(':token')
  async info(@Param('token') token: string) {
    const doc = await this.svc.findByInviteToken(token);
    if (!doc) {
      throw new BadRequestException(
        'This invite link is invalid or has already been used.',
      );
    }
    return { name: doc.name, email: doc.email, status: doc.status };
  }

  /** Candidate sets their password — then they're logged straight in. */
  @Post(':token/set-password')
  async setPassword(
    @Param('token') token: string,
    @Body() body: { password?: string },
  ) {
    const password = (body.password || '').trim();
    if (password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }
    const doc = await this.svc.setPassword(token, password);
    const id = doc.id;
    const accessToken = this.jwt.sign({
      sub: id,
      email: doc.email,
      role: 'candidate',
    });
    return {
      token: accessToken,
      user: { id, name: doc.name, email: doc.email, role: 'candidate' },
    };
  }
}
