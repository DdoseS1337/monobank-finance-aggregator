import { randomUUID } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import dayjs from 'dayjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';

const DEFAULT_TTL_MINUTES = 15;

export interface StageInput {
  userId: string;
  actionType: string;
  payload: Record<string, unknown>;
  preview: Record<string, unknown>;
  initiatedBy: 'user' | 'agent';
  ttlMinutes?: number;
}

export interface StagedAction {
  id: string;
  userId: string;
  actionType: string;
  payload: Record<string, unknown>;
  preview: Record<string, unknown>;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'EXPIRED';
  initiatedAt: Date;
  expiresAt: Date;
  resolvedAt: Date | null;
}

/**
 * Two-step confirmation gateway used by every mutation tool.
 *
 *   stage()   — write the intent + a human-readable preview, return id.
 *   confirm() — flip status to CONFIRMED and return the payload to the caller.
 *   reject()  — flip to REJECTED.
 *   expire()  — bulk-mark stale rows; called from a scheduler.
 *
 * We never execute the actual mutation here — confirm() returns the payload
 * and the caller (e.g. recommendation acceptance flow) performs the change.
 * This keeps the staging layer agnostic to the domain.
 */
@Injectable()
export class StagedActionsService {
  constructor(private readonly prisma: PrismaService) {}

  async stage(input: StageInput): Promise<StagedAction> {
    const ttlMinutes = input.ttlMinutes ?? DEFAULT_TTL_MINUTES;
    const now = new Date();

    // Dedupe: if there is an unexpired PENDING action for the same user
    // + actionType + payload, reuse it instead of creating a duplicate.
    // Protects against the LLM retrying a mutation tool after seeing a
    // CONFIRMATION_REQUIRED reply that it misread as failure.
    const existing = await this.prisma.stagedAction.findFirst({
      where: {
        userId: input.userId,
        actionType: input.actionType,
        status: 'PENDING',
        expiresAt: { gt: now },
      },
      orderBy: { initiatedAt: 'desc' },
    });
    if (existing && this.payloadsEqual(existing.payload, input.payload)) {
      return this.toDto(existing);
    }

    const expiresAt = dayjs(now).add(ttlMinutes, 'minute').toDate();
    const row = await this.prisma.stagedAction.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        actionType: input.actionType,
        payload: input.payload as Prisma.InputJsonValue,
        preview: input.preview as Prisma.InputJsonValue,
        initiatedBy: input.initiatedBy,
        initiatedAt: now,
        expiresAt,
        status: 'PENDING',
      },
    });

    return this.toDto(row);
  }

  private payloadsEqual(a: unknown, b: unknown): boolean {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }

  async confirm(userId: string, stagedActionId: string): Promise<StagedAction> {
    const row = await this.requireOwned(userId, stagedActionId);
    if (row.status !== 'PENDING') {
      throw new NotFoundException(`Staged action ${stagedActionId} is ${row.status.toLowerCase()}`);
    }
    if (row.expiresAt <= new Date()) {
      await this.prisma.stagedAction.update({
        where: { id: row.id },
        data: { status: 'EXPIRED', resolvedAt: new Date() },
      });
      throw new NotFoundException('Staged action has expired');
    }
    const updated = await this.prisma.stagedAction.update({
      where: { id: row.id },
      data: { status: 'CONFIRMED', resolvedAt: new Date() },
    });
    return this.toDto(updated);
  }

  async reject(userId: string, stagedActionId: string): Promise<StagedAction> {
    const row = await this.requireOwned(userId, stagedActionId);
    if (row.status !== 'PENDING') {
      return this.toDto(row);
    }
    const updated = await this.prisma.stagedAction.update({
      where: { id: row.id },
      data: { status: 'REJECTED', resolvedAt: new Date() },
    });
    return this.toDto(updated);
  }

  async findOne(userId: string, stagedActionId: string): Promise<StagedAction> {
    return this.toDto(await this.requireOwned(userId, stagedActionId));
  }

  async listPending(userId: string): Promise<StagedAction[]> {
    const rows = await this.prisma.stagedAction.findMany({
      where: { userId, status: 'PENDING', expiresAt: { gt: new Date() } },
      orderBy: { initiatedAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async expireStale(): Promise<number> {
    const result = await this.prisma.stagedAction.updateMany({
      where: { status: 'PENDING', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED', resolvedAt: new Date() },
    });
    return result.count;
  }

  private async requireOwned(userId: string, id: string) {
    const row = await this.prisma.stagedAction.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      throw new NotFoundException(`Staged action ${id} not found`);
    }
    return row;
  }

  private toDto(row: {
    id: string;
    userId: string;
    actionType: string;
    payload: Prisma.JsonValue;
    preview: Prisma.JsonValue;
    status: string;
    initiatedAt: Date;
    expiresAt: Date;
    resolvedAt: Date | null;
  }): StagedAction {
    return {
      id: row.id,
      userId: row.userId,
      actionType: row.actionType,
      payload: (row.payload as Record<string, unknown>) ?? {},
      preview: (row.preview as Record<string, unknown>) ?? {},
      status: row.status as StagedAction['status'],
      initiatedAt: row.initiatedAt,
      expiresAt: row.expiresAt,
      resolvedAt: row.resolvedAt,
    };
  }
}
