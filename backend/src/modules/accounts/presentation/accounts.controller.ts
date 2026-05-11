import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { SupabaseAuthGuard } from '../../../auth/supabase.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../auth/current-user.decorator';
import { AccountsService } from '../application/accounts.service';

class LinkMonobankDto {
  @IsString()
  @Length(10, 256)
  token!: string;
}

@ApiTags('accounts')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Post('monobank/link')
  async linkMonobank(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LinkMonobankDto,
  ) {
    return this.service.linkMonobankAccounts(user.id, dto.token);
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.service.listAccounts(user.id);
    return rows.map((r) => ({
      ...r,
      balance: (r.balance as unknown as { toFixed: (n: number) => string }).toFixed(2),
      linkedAt: r.linkedAt.toISOString(),
    }));
  }

  @Delete(':id')
  async unlink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.service.unlinkAccount(user.id, id);
    return { ok: true };
  }
}
