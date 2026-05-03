import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { SupabaseGuard } from '../../../auth/supabase.guard';
import { CurrentUser, AuthUser } from '../../../auth/current-user.decorator';
import { AccountService } from '../application/account.service';
import { LinkAccountDto } from './dto/link-account.dto';

@Controller('accounts')
@UseGuards(SupabaseGuard)
export class AccountsController {
  constructor(private readonly accountService: AccountService) {}

  @Post('link')
  async linkAccount(
    @CurrentUser() user: AuthUser,
    @Body() dto: LinkAccountDto,
  ) {
    return this.accountService.linkAccount(user.id, dto);
  }

  @Get()
  async listAccounts(@CurrentUser() user: AuthUser) {
    return this.accountService.listAccounts(user.id);
  }

  @Delete(':id')
  async unlinkAccount(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    await this.accountService.unlinkAccount(user.id, id);
    return { success: true };
  }
}
