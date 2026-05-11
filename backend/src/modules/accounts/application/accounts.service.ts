import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma, AccountType } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { CredentialVault } from '../../../shared-kernel/credentials/credential-vault.service';
import { MonobankClient, MonobankAccount } from '../../transactions/infrastructure/monobank.client';

const MONOBANK_PROVIDER = 'monobank';

/**
 * Links and syncs Monobank accounts.
 *
 * Token storage: a single encrypted row per (user, provider) in
 * `provider_credentials` via `CredentialVault`. Sub-accounts (UAH card,
 * USD jar, FOP) share that one credential and never carry the token
 * themselves — `accounts.metadata` is purely non-secret bank metadata.
 *
 * Re-linking with a new token rotates the credential atomically; the
 * `(provider, externalId)` uniqueness on `accounts` keeps sub-account
 * upserts idempotent.
 */
@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly monobank: MonobankClient,
    private readonly vault: CredentialVault,
  ) {}

  async linkMonobankAccounts(userId: string, token: string): Promise<{
    linked: number;
    accounts: Array<{ id: string; name: string; currency: string; balance: string; type: string }>;
  }> {
    const info = await this.monobank.getClientInfo(token).catch((err) => {
      throw new ConflictException(
        `Monobank rejected token: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    });

    await this.vault.store(userId, MONOBANK_PROVIDER, token);

    let linked = 0;
    const accounts: Array<{
      id: string;
      name: string;
      currency: string;
      balance: string;
      type: string;
    }> = [];
    for (const acc of info.accounts) {
      const persisted = await this.upsertAccount(userId, acc, info.name);
      accounts.push({
        id: persisted.id,
        name: persisted.name,
        currency: persisted.currency,
        balance: persisted.balance.toFixed(2),
        type: persisted.type,
      });
      linked++;
    }
    this.logger.log(`Linked ${linked} Monobank sub-accounts for user=${userId}`);
    return { linked, accounts };
  }

  async listAccounts(userId: string) {
    return this.prisma.account.findMany({
      where: { userId, archivedAt: null },
      orderBy: { linkedAt: 'desc' },
      select: {
        id: true,
        provider: true,
        name: true,
        currency: true,
        balance: true,
        type: true,
        linkedAt: true,
      },
    });
  }

  async getAccount(userId: string, accountId: string) {
    // Explicit select: never surface `metadata` through the service API.
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
      select: {
        id: true,
        userId: true,
        provider: true,
        externalId: true,
        name: true,
        currency: true,
        balance: true,
        type: true,
        linkedAt: true,
        archivedAt: true,
      },
    });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);
    return account;
  }

  async unlinkAccount(userId: string, accountId: string): Promise<void> {
    await this.getAccount(userId, accountId);
    await this.prisma.account.update({
      where: { id: accountId },
      data: { archivedAt: new Date() },
    });
    // If this was the user's last active Monobank sub-account, revoke the
    // stored credential so a stale token can't be re-used.
    const remaining = await this.prisma.account.count({
      where: { userId, provider: MONOBANK_PROVIDER, archivedAt: null },
    });
    if (remaining === 0) {
      await this.vault.revoke(userId, MONOBANK_PROVIDER);
      this.logger.log(`Revoked Monobank credential for user=${userId} (no active accounts)`);
    }
  }

  private async upsertAccount(
    userId: string,
    monoAcc: MonobankAccount,
    clientName: string,
  ) {
    const currency = MonobankClient.currencyCodeToIso(monoAcc.currencyCode);
    const accountType: AccountType = this.deriveType(monoAcc);
    const masked = monoAcc.maskedPan?.[0] ?? monoAcc.iban ?? monoAcc.id;
    const name = `${clientName} · ${currency}${masked ? ` (${masked})` : ''}`;

    const metadata = {
      monobank: {
        sendId: monoAcc.sendId,
        cashbackType: monoAcc.cashbackType,
        creditLimit: monoAcc.creditLimit,
        iban: monoAcc.iban,
        maskedPan: monoAcc.maskedPan,
        type: monoAcc.type,
      },
    } satisfies Prisma.InputJsonValue;

    return this.prisma.account.upsert({
      where: { provider_externalId: { provider: MONOBANK_PROVIDER, externalId: monoAcc.id } },
      create: {
        userId,
        provider: MONOBANK_PROVIDER,
        externalId: monoAcc.id,
        name,
        currency,
        balance: monoAcc.balance / 100,
        type: accountType,
        metadata,
      },
      update: {
        name,
        balance: monoAcc.balance / 100,
        currency,
        type: accountType,
        archivedAt: null,
        metadata,
      },
    });
  }

  private deriveType(account: MonobankAccount): AccountType {
    switch (account.type) {
      case 'fop':
      case 'iban':
        return 'CHECKING';
      case 'platinum':
      case 'white':
      case 'eAid':
      case 'black':
        return 'CHECKING';
      case 'madFox':
      case 'yellow':
        return 'CREDIT';
      default:
        return 'CHECKING';
    }
  }
}
