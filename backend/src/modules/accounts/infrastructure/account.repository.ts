import { Injectable } from '@nestjs/common';
import { Account, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface AccountCreateInput {
  userId: string;
  source: string;
  externalAccountId: string;
  name?: string;
  currency: string;
  accountType?: string;
  balance?: number;
  maskedPan?: string;
}

@Injectable()
export class AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: AccountCreateInput): Promise<Account> {
    return this.prisma.account.upsert({
      where: {
        uq_user_source_external: {
          userId: input.userId,
          source: input.source,
          externalAccountId: input.externalAccountId,
        },
      },
      create: {
        userId: input.userId,
        source: input.source,
        externalAccountId: input.externalAccountId,
        name: input.name ?? null,
        currency: input.currency,
        accountType: input.accountType ?? null,
        balance: input.balance != null ? new Prisma.Decimal(input.balance) : null,
        maskedPan: input.maskedPan ?? null,
      },
      update: {
        name: input.name ?? undefined,
        currency: input.currency,
        accountType: input.accountType ?? undefined,
        balance: input.balance != null ? new Prisma.Decimal(input.balance) : undefined,
        maskedPan: input.maskedPan ?? undefined,
        isActive: true,
      },
    });
  }

  async findByUserId(userId: string, onlyActive = true): Promise<Account[]> {
    return this.prisma.account.findMany({
      where: { userId, ...(onlyActive ? { isActive: true } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string): Promise<Account | null> {
    return this.prisma.account.findUnique({ where: { id } });
  }

  async deactivate(id: string): Promise<Account> {
    return this.prisma.account.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async updateSyncMeta(id: string, balance: number): Promise<void> {
    await this.prisma.account.update({
      where: { id },
      data: {
        lastSyncedAt: new Date(),
        balance: new Prisma.Decimal(balance),
      },
    });
  }
}
