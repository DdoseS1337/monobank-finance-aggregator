import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { UIMessage } from 'ai';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AiMessageRecord, AiThread } from '../domain/ai.interfaces';

@Injectable()
export class AiThreadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string): Promise<AiThread[]> {
    const rows = await this.prisma.aiThread.findMany({
      where: { userId },
      orderBy: { lastMessageAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.mapThread(r));
  }

  async create(userId: string, model: string | null): Promise<AiThread> {
    const row = await this.prisma.aiThread.create({
      data: { userId, model },
    });
    return this.mapThread(row);
  }

  async findByIdForUser(id: string, userId: string): Promise<AiThread> {
    const row = await this.prisma.aiThread.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      throw new NotFoundException(`Thread ${id} not found`);
    }
    return this.mapThread(row);
  }

  async deleteForUser(id: string, userId: string): Promise<void> {
    await this.prisma.aiThread.deleteMany({ where: { id, userId } });
  }

  async updateMeta(
    id: string,
    data: { title?: string; model?: string; lastMessageAt?: Date },
  ): Promise<void> {
    await this.prisma.aiThread.update({ where: { id }, data });
  }

  async listMessages(threadId: string): Promise<AiMessageRecord[]> {
    const rows = await this.prisma.aiMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      threadId: r.threadId,
      role: r.role as 'user' | 'assistant' | 'system',
      parts: r.parts as unknown as UIMessage['parts'],
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async appendMessage(
    threadId: string,
    role: 'user' | 'assistant' | 'system',
    parts: UIMessage['parts'],
  ): Promise<void> {
    await this.prisma.aiMessage.create({
      data: {
        threadId,
        role,
        parts: parts as unknown as Prisma.InputJsonValue,
      },
    });
    await this.prisma.aiThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() },
    });
  }

  private mapThread(row: {
    id: string;
    userId: string;
    title: string | null;
    model: string | null;
    createdAt: Date;
    updatedAt: Date;
    lastMessageAt: Date;
  }): AiThread {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      model: row.model,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      lastMessageAt: row.lastMessageAt.toISOString(),
    };
  }
}
