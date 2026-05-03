import { Injectable } from '@nestjs/common';
import { MerchantRule } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class MerchantRuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllActive(): Promise<MerchantRule[]> {
    return this.prisma.merchantRule.findMany({
      where: { isActive: true },
      orderBy: { priority: 'asc' },
    });
  }
}
