export class AccountResponseDto {
  id: string;
  source: string;
  externalAccountId: string;
  name: string | null;
  currency: string;
  accountType: string | null;
  balance: number | null;
  maskedPan: string | null;
  isActive: boolean;
  lastSyncedAt: Date | null;
  createdAt: Date;

  static from(account: {
    id: string;
    source: string;
    externalAccountId: string;
    name: string | null;
    currency: string;
    accountType: string | null;
    balance: { toNumber(): number } | null;
    maskedPan: string | null;
    isActive: boolean;
    lastSyncedAt: Date | null;
    createdAt: Date;
  }): AccountResponseDto {
    const dto = new AccountResponseDto();
    dto.id = account.id;
    dto.source = account.source;
    dto.externalAccountId = account.externalAccountId;
    dto.name = account.name;
    dto.currency = account.currency;
    dto.accountType = account.accountType;
    dto.balance = account.balance != null ? account.balance.toNumber() : null;
    dto.maskedPan = account.maskedPan;
    dto.isActive = account.isActive;
    dto.lastSyncedAt = account.lastSyncedAt;
    dto.createdAt = account.createdAt;
    return dto;
  }
}
