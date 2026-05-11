import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, isAxiosError } from 'axios';

export interface MonobankClientInfo {
  clientId: string;
  name: string;
  webHookUrl: string | null;
  accounts: MonobankAccount[];
}

export interface MonobankAccount {
  id: string;
  sendId: string | null;
  currencyCode: number;
  cashbackType: string | null;
  balance: number;
  creditLimit: number;
  maskedPan: string[];
  type: string;
  iban: string | null;
}

export interface MonobankCurrencyRate {
  currencyCodeA: number;
  currencyCodeB: number;
  date: number;
  rateBuy?: number;
  rateSell?: number;
  rateCross?: number;
}

export interface MonobankStatementItem {
  id: string;
  time: number;
  description: string;
  mcc: number;
  originalMcc: number;
  hold: boolean;
  amount: number;
  operationAmount: number;
  currencyCode: number;
  commissionRate: number;
  cashbackAmount: number;
  balance: number;
  comment?: string;
  receiptId?: string;
  invoiceId?: string;
  counterEdrpou?: string;
  counterIban?: string;
  counterName?: string;
}

const NUMERIC_TO_ISO_CURRENCY: Record<number, string> = {
  980: 'UAH',
  840: 'USD',
  978: 'EUR',
  826: 'GBP',
  985: 'PLN',
};

/**
 * Thin wrapper around Monobank's Personal API.
 *
 * Rate limits:
 *   - /personal/client-info: 1 req / 60s
 *   - /personal/statement/...: 1 req / 60s
 *
 * The retry/cooldown layer above this client should respect those limits.
 * For now we let 429 propagate; the caller (BullMQ job) is configured to
 * back off exponentially.
 */
@Injectable()
export class MonobankClient {
  private readonly logger = new Logger(MonobankClient.name);
  private readonly http: AxiosInstance;

  constructor(config: ConfigService) {
    this.http = axios.create({
      baseURL: config.get<string>('MONOBANK_BASE_URL', 'https://api.monobank.ua'),
      timeout: 15_000,
    });
  }

  async getClientInfo(token: string): Promise<MonobankClientInfo> {
    const { data } = await this.http.get<MonobankClientInfo>('/personal/client-info', {
      headers: this.headers(token),
    });
    return data;
  }

  /**
   * Returns up to 31 days of statement entries between `from` and `to`.
   * Monobank caps the window at 31 days; the caller is responsible for
   * splitting longer windows.
   */
  async getStatement(
    token: string,
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<MonobankStatementItem[]> {
    const fromTs = Math.floor(from.getTime() / 1000);
    const toTs = Math.floor(to.getTime() / 1000);
    try {
      const { data } = await this.http.get<MonobankStatementItem[]>(
        `/personal/statement/${accountId}/${fromTs}/${toTs}`,
        { headers: this.headers(token) },
      );
      return data;
    } catch (error) {
      if (isAxiosError(error)) {
        this.logger.warn(
          `Monobank /statement failed (${error.response?.status}): ${error.response?.data ? JSON.stringify(error.response.data) : error.message}`,
        );
      }
      throw error;
    }
  }

  async getCurrencyRates(): Promise<MonobankCurrencyRate[]> {
    try {
      const { data } = await this.http.get<MonobankCurrencyRate[]>('/bank/currency', {
        timeout: 10_000,
      });
      return data;
    } catch (error) {
      if (isAxiosError(error)) {
        this.logger.warn(
          `Monobank /bank/currency failed (${error.response?.status}): ${
            error.response?.data ? JSON.stringify(error.response.data) : error.message
          }`,
        );
      }
      throw error;
    }
  }

  async setWebhook(token: string, webHookUrl: string): Promise<void> {
    await this.http.post(
      '/personal/webhook',
      { webHookUrl },
      { headers: this.headers(token) },
    );
  }

  static currencyCodeToIso(code: number): string {
    return NUMERIC_TO_ISO_CURRENCY[code] ?? 'UAH';
  }

  private headers(token: string): Record<string, string> {
    return { 'X-Token': token };
  }
}
