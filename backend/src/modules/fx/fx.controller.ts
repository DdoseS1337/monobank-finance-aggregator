import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional, IsPositive, Matches } from 'class-validator';
import { SupabaseAuthGuard } from '../../auth/supabase.guard';
import { FxRatesService } from './fx-rates.service';

const ISO_RE = /^[A-Z]{3}$/;

class ConvertQueryDto {
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Matches(ISO_RE, { message: 'from must be a 3-letter ISO 4217 code' })
  from!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Matches(ISO_RE, { message: 'to must be a 3-letter ISO 4217 code' })
  to!: string;
}

class ListQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Matches(ISO_RE, { message: 'base must be a 3-letter ISO 4217 code' })
  base?: string;
}

@ApiTags('fx')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('fx')
export class FxController {
  constructor(private readonly rates: FxRatesService) {}

  @Get('rates')
  async list(@Query() query: ListQueryDto) {
    const all = await this.rates.listSupported();
    if (!query.base) return all;
    return all.filter((r) => r.base === query.base);
  }

  @Get('convert')
  async convert(@Query() query: ConvertQueryDto) {
    try {
      const result = await this.rates.convert(query.amount, query.from, query.to);
      return {
        from: query.from,
        to: query.to,
        amountIn: query.amount,
        amountOut: result.amount,
        rate: result.rate,
        asOf: result.asOf,
      };
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }
}
