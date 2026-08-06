import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../common/prisma.service';

/**
 * Server-persisted drafts of the client Add-Candidate form. Each draft has its
 * own id (created when the form is opened) so it can appear in "Your
 * Candidates" as a resumable Draft and be continued later. All operations are
 * scoped to the owning user.
 */
@Injectable()
export class CandidateDraftService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    data: Prisma.InputJsonValue,
  ): Promise<{ id: string }> {
    const row = await this.prisma.candidateFormDraft.create({
      data: { userId, data },
      select: { id: true },
    });
    return { id: row.id };
  }

  list(userId: string) {
    return this.prisma.candidateFormDraft.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, data: true, createdAt: true, updatedAt: true },
    });
  }

  async get(userId: string, id: string): Promise<Prisma.JsonValue | null> {
    const row = await this.prisma.candidateFormDraft.findFirst({
      where: { id, userId },
      select: { data: true },
    });
    return row?.data ?? null;
  }

  async save(
    userId: string,
    id: string,
    data: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.candidateFormDraft.updateMany({
      where: { id, userId },
      data: { data },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.candidateFormDraft.deleteMany({ where: { id, userId } });
  }
}
