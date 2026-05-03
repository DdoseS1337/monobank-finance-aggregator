export interface AccountEntity {
  id: string;
  userId: string;
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
}
