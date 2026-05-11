import { UserProfile } from './user-profile.entity';

export const USER_PROFILE_REPOSITORY = Symbol('UserProfileRepository');

export interface UserProfileRepository {
  save(profile: UserProfile): Promise<void>;
  findByUserId(userId: string): Promise<UserProfile | null>;
}
