import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MccReferenceEntity } from '../domain/mcc-reference.entity';

@Injectable()
export class MccRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByMcc(mcc: number): Promise<MccReferenceEntity | null> {
    return this.prisma.mccReference.findUnique({
      where: { mcc },
    });
  }

  async findAll(): Promise<MccReferenceEntity[]> {
    return this.prisma.mccReference.findMany({
      where: { isActive: true },
    });
  }
}
