import { randomUUID } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';

export interface AgentTurnInput {
  sessionId: string;
  role: 'USER' | 'ASSISTANT' | 'TOOL' | 'SYSTEM';
  content?: string | null;
  toolCalls?: unknown;
  reasoningTrace?: unknown;
  latencyMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}

export interface ToolInvocationInput {
  turnId: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  status: 'OK' | 'ERROR' | 'CONFIRMATION_REQUIRED';
  durationMs?: number;
  error?: unknown;
}

@Injectable()
export class AgentSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async startSession(userId: string, agentType: string): Promise<string> {
    const id = randomUUID();
    await this.prisma.agentSession.create({
      data: {
        id,
        userId,
        agentType,
        status: 'ACTIVE',
      },
    });
    return id;
  }

  async appendTurn(input: AgentTurnInput): Promise<{ id: string; turnNumber: number }> {
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.agentTurn.findFirst({
        where: { sessionId: input.sessionId },
        orderBy: { turnNumber: 'desc' },
        select: { turnNumber: true },
      });
      const turnNumber = (last?.turnNumber ?? 0) + 1;
      const turnId = randomUUID();
      await tx.agentTurn.create({
        data: {
          id: turnId,
          sessionId: input.sessionId,
          turnNumber,
          role: input.role,
          content: input.content ?? null,
          toolCalls: (input.toolCalls ?? null) as Prisma.InputJsonValue,
          reasoningTrace: (input.reasoningTrace ?? null) as Prisma.InputJsonValue,
          latencyMs: input.latencyMs ?? null,
          tokensIn: input.tokensIn ?? null,
          tokensOut: input.tokensOut ?? null,
          costUsd: input.costUsd !== undefined ? new Prisma.Decimal(input.costUsd) : null,
        },
      });
      // Roll up session totals.
      if (input.tokensIn || input.tokensOut || input.costUsd) {
        await tx.agentSession.update({
          where: { id: input.sessionId },
          data: {
            totalTokensIn: { increment: input.tokensIn ?? 0 },
            totalTokensOut: { increment: input.tokensOut ?? 0 },
            totalCostUsd: input.costUsd
              ? { increment: new Prisma.Decimal(input.costUsd) }
              : undefined,
          },
        });
      }
      return { id: turnId, turnNumber };
    });
  }

  async logToolInvocation(input: ToolInvocationInput): Promise<void> {
    await this.prisma.toolInvocation.create({
      data: {
        turnId: input.turnId,
        toolName: input.toolName,
        input: (input.input ?? null) as Prisma.InputJsonValue,
        output: (input.output ?? null) as Prisma.InputJsonValue,
        status: input.status,
        durationMs: input.durationMs ?? null,
        error: (input.error ?? null) as Prisma.InputJsonValue,
      },
    });
  }

  async endSession(sessionId: string): Promise<void> {
    await this.prisma.agentSession.update({
      where: { id: sessionId },
      data: { status: 'ENDED', endedAt: new Date() },
    });
  }

  async getRecentTurns(
    sessionId: string,
    take = 10,
  ): Promise<
    Array<{
      role: string;
      content: string | null;
      toolCalls: unknown;
    }>
  > {
    const session = await this.prisma.agentSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    });
    if (!session) throw new NotFoundException(`Agent session ${sessionId} not found`);
    const turns = await this.prisma.agentTurn.findMany({
      where: { sessionId },
      orderBy: { turnNumber: 'desc' },
      take,
    });
    return turns
      .reverse()
      .map((t) => ({ role: t.role, content: t.content, toolCalls: t.toolCalls }));
  }

  async listSessions(
    userId: string,
    take = 50,
  ): Promise<
    Array<{
      id: string;
      title: string;
      startedAt: Date;
      lastTurnAt: Date | null;
      turnCount: number;
      status: string;
    }>
  > {
    const sessions = await this.prisma.agentSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take,
      include: {
        turns: {
          where: { role: 'USER' },
          orderBy: { turnNumber: 'asc' },
          take: 1,
          select: { content: true, createdAt: true },
        },
        _count: { select: { turns: true } },
      },
    });

    const lastTurns = await this.prisma.agentTurn.groupBy({
      by: ['sessionId'],
      where: { sessionId: { in: sessions.map((s) => s.id) } },
      _max: { createdAt: true },
    });
    const lastBySession = new Map(
      lastTurns.map((row) => [row.sessionId, row._max.createdAt ?? null]),
    );

    return sessions.map((s) => {
      const firstUser = s.turns[0]?.content ?? '';
      const title = firstUser
        ? firstUser.slice(0, 80) + (firstUser.length > 80 ? '…' : '')
        : 'Нова розмова';
      return {
        id: s.id,
        title,
        startedAt: s.startedAt,
        lastTurnAt: lastBySession.get(s.id) ?? null,
        turnCount: s._count.turns,
        status: s.status,
      };
    });
  }

  async getSessionTranscript(
    userId: string,
    sessionId: string,
  ): Promise<{
    id: string;
    startedAt: Date;
    status: string;
    turns: Array<{
      id: string;
      turnNumber: number;
      role: string;
      content: string | null;
      toolCalls: unknown;
      createdAt: Date;
    }>;
  }> {
    const session = await this.prisma.agentSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException(`Agent session ${sessionId} not found`);
    const turns = await this.prisma.agentTurn.findMany({
      where: { sessionId },
      orderBy: { turnNumber: 'asc' },
      select: {
        id: true,
        turnNumber: true,
        role: true,
        content: true,
        toolCalls: true,
        createdAt: true,
      },
    });
    return {
      id: session.id,
      startedAt: session.startedAt,
      status: session.status,
      turns,
    };
  }
}
