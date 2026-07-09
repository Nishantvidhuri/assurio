import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../common/prisma.service';
import { OutboxService } from '../outbox/outbox.service';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly outbox: OutboxService,
  ) {}

  async signup(name: string, email: string, password: string) {
    if (await this.users.findByEmail(email)) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.users.create({ name, email, passwordHash });
    return this.buildOwnerResponse(user);
  }

  async login(email: string, password: string) {
    // 1. Account holder
    const user = await this.users.findByEmail(email);
    if (user && (await bcrypt.compare(password, user.passwordHash))) {
      return this.buildOwnerResponse(user);
    }

    // 2. Invited candidate (password set)
    const subject = await this.prisma.subject.findFirst({
      where: {
        email: email.toLowerCase().trim(),
        passwordHash: { not: null },
      },
    });
    if (
      subject?.passwordHash &&
      (await bcrypt.compare(password, subject.passwordHash))
    ) {
      const token = this.jwt.sign({
        sub: subject.id,
        email: subject.email,
        role: 'candidate',
      });
      return {
        token,
        user: {
          id: subject.id,
          name: subject.name,
          email: subject.email,
          role: 'candidate',
        },
      };
    }

    throw new UnauthorizedException('Invalid email or password');
  }

  async forgotPassword(email: string): Promise<void> {
    const cleanEmail = email.toLowerCase().trim();
    if (!cleanEmail) return;

    const token = randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    let recipientName: string | null = null;

    const user = await this.prisma.user.findUnique({ where: { email: cleanEmail } });
    if (user) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetToken: token, resetTokenExpiresAt: expires },
      });
      recipientName = user.name;
    } else {
      const subj = await this.prisma.subject.findFirst({ where: { email: cleanEmail } });
      if (subj?.passwordHash) {
        await this.prisma.subject.update({
          where: { id: subj.id },
          data: { resetToken: token, resetTokenExpiresAt: expires },
        });
        recipientName = subj.name;
      }
    }

    if (recipientName) {
      const base = process.env.APP_URL || 'http://localhost:3000';
      await this.outbox.emit('email.password-reset', {
        to: cleanEmail,
        name: recipientName,
        resetUrl: `${base}/reset/${token}`,
      });
    }
  }

  async resetInfo(token: string) {
    const now = new Date();
    const user = await this.prisma.user.findFirst({
      where: { resetToken: token, resetTokenExpiresAt: { gt: now } },
    });
    if (user) return { name: user.name, email: user.email };

    const subj = await this.prisma.subject.findFirst({
      where: { resetToken: token, resetTokenExpiresAt: { gt: now } },
    });
    if (subj) return { name: subj.name, email: subj.email };

    throw new NotFoundException('This reset link is invalid or has expired.');
  }

  async resetPassword(token: string, password: string) {
    if (!password || password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }
    const now = new Date();
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.findFirst({
      where: { resetToken: token, resetTokenExpiresAt: { gt: now } },
    });
    if (user) {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, resetToken: null, resetTokenExpiresAt: null },
      });
      return this.buildOwnerResponse(updated);
    }

    const subj = await this.prisma.subject.findFirst({
      where: { resetToken: token, resetTokenExpiresAt: { gt: now } },
    });
    if (subj) {
      const updated = await this.prisma.subject.update({
        where: { id: subj.id },
        data: { passwordHash, resetToken: null, resetTokenExpiresAt: null },
      });
      const access = this.jwt.sign({
        sub: updated.id,
        email: updated.email,
        role: 'candidate',
      });
      return {
        token: access,
        user: { id: updated.id, name: updated.name, email: updated.email, role: 'candidate' },
      };
    }

    throw new NotFoundException('This reset link is invalid or has expired.');
  }

  async getMe(jwtPayload: { sub: string; role?: string }) {
    if (jwtPayload.role === 'candidate') {
      const subject = await this.prisma.subject.findUnique({
        where: { id: jwtPayload.sub },
      });
      if (!subject) throw new UnauthorizedException();
      return {
        id: subject.id,
        name: subject.name,
        email: subject.email,
        role: 'candidate',
      };
    }
    const user = await this.users.findById(jwtPayload.sub);
    if (!user) throw new UnauthorizedException();
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      role: user.role || 'owner',
    };
  }

  async updateMe(
    jwtPayload: { sub: string; role?: string },
    body: { phone?: string },
  ) {
    if (jwtPayload.role === 'candidate') {
      throw new UnauthorizedException('Not available for candidate accounts');
    }
    const user = await this.users.findById(jwtPayload.sub);
    if (!user) throw new UnauthorizedException();

    if (body.phone !== undefined) {
      await this.users.updatePhone(jwtPayload.sub, body.phone);
    }

    const updated = await this.users.findById(jwtPayload.sub);
    return {
      id: updated!.id,
      name: updated!.name,
      email: updated!.email,
      phone: updated!.phone ?? null,
      role: updated!.role || 'owner',
    };
  }

  private buildOwnerResponse(user: { id: string; email: string; name: string; role: string }) {
    const role = user.role || 'owner';
    const token = this.jwt.sign({ sub: user.id, email: user.email, role });
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role },
    };
  }
}
