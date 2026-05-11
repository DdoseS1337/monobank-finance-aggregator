import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { SupabaseAuthGuard } from '../../auth/supabase.guard';
import { EducationService } from './education.service';

class SearchQueryDto {
  @IsString()
  @Length(2, 500)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  k?: number;

  @IsOptional()
  @IsIn(['uk', 'en'])
  lang?: 'uk' | 'en';
}

@ApiTags('education')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('education')
export class EducationController {
  constructor(private readonly education: EducationService) {}

  @Get('search')
  async search(@Query() query: SearchQueryDto) {
    const hits = await this.education.search(query.q, {
      k: query.k,
      lang: query.lang,
    });
    return { hits };
  }

  @Get('articles')
  async list(@Query('lang') lang?: string) {
    const items = await this.education.list(lang ?? 'uk');
    return { items };
  }
}
