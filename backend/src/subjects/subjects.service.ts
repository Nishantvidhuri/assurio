import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma.service';
import { EventsService } from '../common/events.service';
import { Subject } from '../../generated/prisma/client';
import { PdfService } from '../common/pdf.service';

export type SubjectPatch = Partial<{
  name: string;
  role: string;
  email: string;
  phone: string;
  panFront: string | null;
  panBack: string | null;
  panNumber: string | null;
  aadhaarFront: string | null;
  aadhaarBack: string | null;
  aadhaarNumber: string | null;
  panResult: Record<string, unknown> | null;
  aadhaarResult: Record<string, unknown> | null;
  digilockerClientId: string | null;
  digilockerUrl: string | null;
  crimeRequestId: string | null;
  crimeResult: Record<string, unknown> | null;
  consentResult: Record<string, unknown> | null;
  status: string;
}>;

type LogType = 'pan' | 'aadhaar' | 'crime';
const LOG_MAP: Partial<Record<keyof SubjectPatch, LogType>> = {
  panResult: 'pan',
  aadhaarResult: 'aadhaar',
  crimeResult: 'crime',
};

interface LogEntry {
  type: LogType;
  calledAt: string;
  result: Record<string, unknown>;
}

function buildLogEntries(patch: SubjectPatch | Record<string, unknown>): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const [key, logType] of Object.entries(LOG_MAP) as [keyof SubjectPatch, LogType][]) {
    const value = (patch as Record<string, unknown>)[key];
    if (key in patch && value) {
      entries.push({ type: logType, calledAt: new Date().toISOString(), result: value as Record<string, unknown> });
    }
  }
  return entries;
}

@Injectable()
export class SubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly events: EventsService,
  ) {}

  list(userId: string): Promise<Subject[]> {
    return this.prisma.subject.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  create(
    userId: string,
    data: {
      name: string;
      role?: string;
      email: string;
      phone?: string;
      panNumber?: string;
      aadhaarNumber?: string;
    },
  ): Promise<Subject> {
    return this.prisma.subject.create({
      data: {
        userId,
        name: data.name.trim(),
        role: (data.role || '').trim(),
        email: data.email.toLowerCase().trim(),
        phone: (data.phone || '').trim(),
        panNumber: (data.panNumber || '').trim().toUpperCase() || undefined,
        aadhaarNumber: (data.aadhaarNumber || '').replace(/\s/g, '').trim() || undefined,
        inviteToken: randomBytes(24).toString('hex'),
        status: 'invited',
      },
    });
  }

  async findOwned(userId: string, id: string): Promise<Subject> {
    const doc = await this.prisma.subject.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Subject not found');
    if (doc.userId !== userId) throw new ForbiddenException();
    return doc;
  }

  findById(id: string): Promise<Subject | null> {
    return this.prisma.subject.findUnique({ where: { id } });
  }

  findByInviteToken(token: string): Promise<Subject | null> {
    return this.prisma.subject.findFirst({ where: { inviteToken: token } });
  }

  findCandidateByEmail(email: string): Promise<Subject | null> {
    return this.prisma.subject.findFirst({
      where: {
        email: email.toLowerCase().trim(),
        passwordHash: { not: null },
      },
    });
  }

  async patch(userId: string, id: string, patch: SubjectPatch): Promise<Subject> {
    await this.findOwned(userId, id);
    const updated = await this.prisma.subject.update({ where: { id }, data: patch as Record<string, unknown> });
    this.events.emit(this.events.subjectChannel(id), updated);
    return updated;
  }

  async patchOwn(id: string, patch: SubjectPatch): Promise<Subject> {
    const doc = await this.findById(id);
    if (!doc) throw new NotFoundException('Not found');

    const newEntries = buildLogEntries(patch);
    const data: Record<string, unknown> = { ...patch };
    if (newEntries.length > 0) {
      const existing = (doc.verificationLog as LogEntry[] | null) ?? [];
      data['verificationLog'] = [...existing, ...newEntries];
    }
    const updated = await this.prisma.subject.update({ where: { id }, data });
    this.events.emit(this.events.subjectChannel(id), updated);
    return updated;
  }

  async patchAny(id: string, patch: Record<string, unknown>): Promise<Subject> {
    const doc = await this.findById(id);
    if (!doc) throw new NotFoundException('Not found');

    const newEntries = buildLogEntries(patch as SubjectPatch);
    const data: Record<string, unknown> = { ...patch };
    if (newEntries.length > 0) {
      const existing = (doc.verificationLog as LogEntry[] | null) ?? [];
      data['verificationLog'] = [...existing, ...newEntries];
    }
    const updated = await this.prisma.subject.update({ where: { id }, data });
    this.events.emit(this.events.subjectChannel(id), updated);
    return updated;
  }

  async setPassword(token: string, password: string): Promise<Subject> {
    const doc = await this.findByInviteToken(token);
    if (!doc) {
      throw new NotFoundException('This invite link is invalid or has expired.');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    return this.prisma.subject.update({
      where: { id: doc.id },
      data: { passwordHash, status: 'active', inviteToken: null },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.prisma.subject.delete({ where: { id } });
  }
}
