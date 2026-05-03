import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  MonobankClientInfo,
  MonobankRawTransaction,
} from './monobank-raw-transaction.dto';

const RATE_LIMIT_MS = 60_000;

@Injectable()
export class MonobankClientService {
  private readonly logger = new Logger(MonobankClientService.name);
  private readonly http: AxiosInstance;
  private lastClientInfoTime = 0;
  private lastStatementTime = 0;

  constructor(private readonly configService: ConfigService) {
    this.http = axios.create({
      baseURL: this.configService.get<string>(
        'MONOBANK_BASE_URL',
        'https://api.monobank.ua',
      ),
      timeout: 30_000,
    });
  }

  private async enforceRateLimit(
    type: 'clientInfo' | 'statement',
  ): Promise<void> {
    const lastTime =
      type === 'clientInfo'
        ? this.lastClientInfoTime
        : this.lastStatementTime;

    const now = Date.now();
    const elapsed = now - lastTime;

    if (lastTime > 0 && elapsed < RATE_LIMIT_MS) {
      const waitMs = RATE_LIMIT_MS - elapsed;
      this.logger.warn(
        `Rate limit (${type}): waiting ${Math.ceil(waitMs / 1000)}s before next request`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    if (type === 'clientInfo') {
      this.lastClientInfoTime = Date.now();
    } else {
      this.lastStatementTime = Date.now();
    }
  }

  async getClientInfo(token: string): Promise<MonobankClientInfo> {
    await this.enforceRateLimit('clientInfo');

    const response = await this.http.get<MonobankClientInfo>(
      '/personal/client-info',
      { headers: { 'X-Token': token } },
    );

    return response.data;
  }

  async getStatements(
    token: string,
    accountId: string,
    from: number,
    to: number,
  ): Promise<MonobankRawTransaction[]> {
    await this.enforceRateLimit('statement');

    const response = await this.http.get<MonobankRawTransaction[]>(
      `/personal/statement/${accountId}/${from}/${to}`,
      { headers: { 'X-Token': token } },
    );

    return response.data;
  }
}
