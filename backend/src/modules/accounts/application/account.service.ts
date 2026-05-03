import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { BANK_PROVIDERS } from '../../../common/constants/injection-tokens';
import { BankTransactionProvider } from '../../../common/interfaces/bank-transaction-provider.interface';
import { AccountRepository } from '../infrastructure/account.repository';
import { AccountResponseDto } from '../presentation/dto/account-response.dto';
import { LinkAccountDto } from '../presentation/dto/link-account.dto';
import { currencyCodeToString } from '../../../common/utils/currency.util';

@Injectable()
export class AccountService {
  constructor(
    @Inject(BANK_PROVIDERS)
    private readonly providers: BankTransactionProvider[],
    private readonly accountRepo: AccountRepository,
  ) {}

  async linkAccount(
    userId: string,
    dto: LinkAccountDto,
  ): Promise<AccountResponseDto> {
    const provider = this.providers.find((p) => p.source === dto.source);
    if (!provider) {
      throw new BadRequestException(`Unknown bank source: ${dto.source}`);
    }

    const bankAccounts = await provider.fetchAccounts(dto.token);
    const bankAccount = bankAccounts.find((a) => a.id === dto.externalAccountId);

    if (!bankAccount) {
      throw new BadRequestException(
        `Account ${dto.externalAccountId} not found for source ${dto.source}`,
      );
    }

    const currency = currencyCodeToString(bankAccount.currencyCode);
    const saved = await this.accountRepo.upsert({
      userId,
      source: dto.source,
      externalAccountId: dto.externalAccountId,
      name: dto.name ?? undefined,
      currency,
      accountType: bankAccount.type ?? null,
      balance: bankAccount.balance / 100,
    });

    return AccountResponseDto.from(saved);
  }

  async listAccounts(userId: string): Promise<AccountResponseDto[]> {
    const accounts = await this.accountRepo.findByUserId(userId);
    return accounts.map(AccountResponseDto.from);
  }

  async unlinkAccount(userId: string, accountId: string): Promise<void> {
    const account = await this.accountRepo.findById(accountId);
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }
    if (account.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    await this.accountRepo.deactivate(accountId);
  }
}
