import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import { MccRepository } from '../infrastructure/mcc.repository';

interface MccCategory {
  normalizedCategory: string;
  subcategory: string;
}

const MCC_CACHE_PREFIX = 'mcc:';
const MCC_CACHE_TTL = 86400; // 24 hours

@Injectable()
export class MccLookupService implements OnModuleInit {
  private readonly logger = new Logger(MccLookupService.name);

  constructor(
    private readonly mccRepository: MccRepository,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    await this.warmCache();
  }

  async warmCache(): Promise<void> {
    const all = await this.mccRepository.findAll();
    for (const entry of all) {
      const value: MccCategory = {
        normalizedCategory: entry.normalizedCategory,
        subcategory: entry.subcategory,
      };
      await this.redis.set(
        `${MCC_CACHE_PREFIX}${entry.mcc}`,
        JSON.stringify(value),
        MCC_CACHE_TTL,
      );
    }
    this.logger.log(`Warmed MCC cache with ${all.length} entries`);
  }

  async getCategoryForMcc(mcc: number): Promise<MccCategory | null> {
    const cached = await this.redis.get(`${MCC_CACHE_PREFIX}${mcc}`);
    if (cached) {
      return JSON.parse(cached) as MccCategory;
    }

    const entry = await this.mccRepository.findByMcc(mcc);
    if (!entry) {
      return null;
    }

    const value: MccCategory = {
      normalizedCategory: entry.normalizedCategory,
      subcategory: entry.subcategory,
    };
    await this.redis.set(
      `${MCC_CACHE_PREFIX}${mcc}`,
      JSON.stringify(value),
      MCC_CACHE_TTL,
    );

    return value;
  }
}
