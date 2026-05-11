import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import {
  Channel,
  LiteracyLevel,
  RiskTolerance,
  Tone,
  UserProfile,
  BehavioralTraits,
  QuietHours,
} from '../domain/user-profile.entity';
import { UserProfileRepository } from '../domain/repositories.interface';

@Injectable()
export class PrismaUserProfileRepository implements UserProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(profile: UserProfile): Promise<void> {
    const s = profile.toSnapshot();
    await this.prisma.userProfile.upsert({
      where: { userId: s.userId },
      create: {
        userId: s.userId,
        riskTolerance: s.riskTolerance,
        financialLiteracyLevel: s.financialLiteracyLevel,
        behavioralTraits: s.behavioralTraits as unknown as Prisma.InputJsonValue,
        preferredTone: s.preferredTone,
        preferredChannels: s.preferredChannels,
        preferredLanguage: s.preferredLanguage,
        quietHours: (s.quietHours ?? null) as unknown as Prisma.InputJsonValue,
      },
      update: {
        riskTolerance: s.riskTolerance,
        financialLiteracyLevel: s.financialLiteracyLevel,
        behavioralTraits: s.behavioralTraits as unknown as Prisma.InputJsonValue,
        preferredTone: s.preferredTone,
        preferredChannels: s.preferredChannels,
        preferredLanguage: s.preferredLanguage,
        quietHours: (s.quietHours ?? null) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findByUserId(userId: string): Promise<UserProfile | null> {
    const row = await this.prisma.userProfile.findUnique({ where: { userId } });
    if (!row) return null;
    return UserProfile.rehydrate({
      userId: row.userId,
      riskTolerance: row.riskTolerance as RiskTolerance,
      financialLiteracyLevel: row.financialLiteracyLevel as LiteracyLevel,
      behavioralTraits: (row.behavioralTraits as unknown as BehavioralTraits) ?? {
        eveningSpenderScore: 0,
        weekendSpenderScore: 0,
        impulsivityScore: 0,
        plannerScore: 0,
        segment: null,
        observations: 0,
        computedAt: null,
      },
      preferredTone: row.preferredTone as Tone,
      preferredChannels: row.preferredChannels as Channel[],
      preferredLanguage: row.preferredLanguage as 'uk' | 'en',
      quietHours: (row.quietHours as unknown as QuietHours | null) ?? null,
      updatedAt: row.updatedAt,
    });
  }
}
