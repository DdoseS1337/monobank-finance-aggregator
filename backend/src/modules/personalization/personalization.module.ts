import { Module } from '@nestjs/common';
import { PersonalizationController } from './presentation/personalization.controller';
import { PersonalizationService } from './application/personalization.service';
import { BehaviorModelerService } from './application/behavior-modeler.service';
import { PersonalizationScheduler } from './application/personalization.scheduler';
import { PrismaUserProfileRepository } from './infrastructure/user-profile.repository';
import { USER_PROFILE_REPOSITORY } from './domain/repositories.interface';

/**
 * Personalization Context — Phase 5.2.
 *
 * UserProfile = explicit prefs (risk, tone, channels, quiet hours) +
 * derived BehavioralTraits computed nightly from transaction history.
 */
@Module({
  controllers: [PersonalizationController],
  providers: [
    PersonalizationService,
    BehaviorModelerService,
    PersonalizationScheduler,
    { provide: USER_PROFILE_REPOSITORY, useClass: PrismaUserProfileRepository },
  ],
  exports: [PersonalizationService],
})
export class PersonalizationModule {}
