import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SupabaseAuthGuard } from '../../../auth/supabase.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../auth/current-user.decorator';
import { PersonalizationService } from '../application/personalization.service';
import { UserProfile } from '../domain/user-profile.entity';

const RISK = ['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'] as const;
const LITERACY = ['BEGINNER', 'INTERMEDIATE', 'EXPERT'] as const;
const TONES = ['FORMAL', 'FRIENDLY', 'DIRECT'] as const;
const CHANNELS = ['in_app', 'email', 'push', 'telegram'] as const;
const LANGS = ['uk', 'en'] as const;

class QuietHoursDto {
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  from!: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  to!: string;
}

class UpdateProfileDto {
  @IsOptional()
  @IsIn(RISK as unknown as string[])
  riskTolerance?: (typeof RISK)[number];

  @IsOptional()
  @IsIn(LITERACY as unknown as string[])
  financialLiteracyLevel?: (typeof LITERACY)[number];

  @IsOptional()
  @IsIn(TONES as unknown as string[])
  preferredTone?: (typeof TONES)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(CHANNELS as unknown as string[], { each: true })
  preferredChannels?: (typeof CHANNELS)[number][];

  @IsOptional()
  @IsIn(LANGS as unknown as string[])
  preferredLanguage?: (typeof LANGS)[number];

  @IsOptional()
  @ValidateNested()
  @Type(() => QuietHoursDto)
  quietHours?: QuietHoursDto | null;
}

interface ProfileResponse {
  riskTolerance: string;
  financialLiteracyLevel: string;
  preferredTone: string;
  preferredChannels: string[];
  preferredLanguage: string;
  quietHours: { from: string; to: string } | null;
  behavioralTraits: unknown;
}

function map(profile: UserProfile): ProfileResponse {
  return {
    riskTolerance: profile.riskTolerance,
    financialLiteracyLevel: profile.literacy,
    preferredTone: profile.tone,
    preferredChannels: profile.channels,
    preferredLanguage: profile.language,
    quietHours: profile.quietHours,
    behavioralTraits: profile.traits,
  };
}

@ApiTags('personalization')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('personalization')
export class PersonalizationController {
  constructor(private readonly service: PersonalizationService) {}

  @Get('profile')
  async getProfile(@CurrentUser() user: AuthenticatedUser): Promise<ProfileResponse> {
    const profile = await this.service.getOrInit(user.id);
    return map(profile);
  }

  @Patch('profile')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponse> {
    const profile = await this.service.updatePreferences(user.id, dto);
    return map(profile);
  }

  @Post('profile/recompute-traits')
  async recompute(@CurrentUser() user: AuthenticatedUser): Promise<ProfileResponse> {
    const profile = await this.service.refreshBehaviorModel(user.id);
    return map(profile);
  }
}
