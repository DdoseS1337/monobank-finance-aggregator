import { Inject, Injectable } from '@nestjs/common';
import {
  Channel,
  LiteracyLevel,
  QuietHours,
  RiskTolerance,
  Tone,
  UserProfile,
} from '../domain/user-profile.entity';
import {
  USER_PROFILE_REPOSITORY,
  UserProfileRepository,
} from '../domain/repositories.interface';
import { BehaviorModelerService } from './behavior-modeler.service';

@Injectable()
export class PersonalizationService {
  constructor(
    @Inject(USER_PROFILE_REPOSITORY)
    private readonly profiles: UserProfileRepository,
    private readonly modeler: BehaviorModelerService,
  ) {}

  async getOrInit(userId: string): Promise<UserProfile> {
    const existing = await this.profiles.findByUserId(userId);
    if (existing) return existing;
    const initial = UserProfile.initialFor(userId);
    await this.profiles.save(initial);
    return initial;
  }

  async updatePreferences(
    userId: string,
    update: {
      riskTolerance?: RiskTolerance;
      financialLiteracyLevel?: LiteracyLevel;
      preferredTone?: Tone;
      preferredChannels?: Channel[];
      preferredLanguage?: 'uk' | 'en';
      quietHours?: QuietHours | null;
    },
  ): Promise<UserProfile> {
    const profile = await this.getOrInit(userId);
    if (update.riskTolerance) profile.setRiskTolerance(update.riskTolerance);
    if (update.financialLiteracyLevel) profile.setLiteracy(update.financialLiteracyLevel);
    if (update.preferredTone) profile.setTone(update.preferredTone);
    if (update.preferredChannels) profile.setChannels(update.preferredChannels);
    if (update.preferredLanguage) profile.setLanguage(update.preferredLanguage);
    if (update.quietHours !== undefined) profile.setQuietHours(update.quietHours);
    await this.profiles.save(profile);
    return profile;
  }

  async refreshBehaviorModel(userId: string): Promise<UserProfile> {
    const profile = await this.getOrInit(userId);
    const traits = await this.modeler.computeFor(userId);
    profile.applyTraits(traits);
    await this.profiles.save(profile);
    return profile;
  }
}
