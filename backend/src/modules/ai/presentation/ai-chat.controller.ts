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
import { Throttle } from '@nestjs/throttler';
import { SupabaseAuthGuard } from '../../../auth/supabase.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../auth/current-user.decorator';
import { AiChatService } from '../application/ai-chat.service';
import { AgentSessionService } from '../orchestration/agent-session.service';
import { ChatDto } from './dto/chat-dto';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('ai')
export class AiChatController {
  constructor(
    private readonly chat: AiChatService,
    private readonly sessions: AgentSessionService,
  ) {}

  @Get('sessions')
  async listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.sessions.listSessions(user.id);
  }

  @Get('sessions/:id')
  async getSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.sessions.getSessionTranscript(user.id, id);
  }

  @Post('chat')
  @Throttle({ ai: { ttl: 60_000, limit: 10 } })
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChatDto,
  ) {
    return this.chat.chat({
      userId: user.id,
      sessionId: dto.sessionId,
      message: dto.message,
    });
  }

  @Get('staged-actions')
  async listPending(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.listPendingActions(user.id);
  }

  @Post('staged-actions/:id/confirm')
  async confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const result = await this.chat.confirmStagedAction(user.id, id);
    return { ok: true, result };
  }

  @Post('staged-actions/:id/reject')
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.chat.rejectStagedAction(user.id, id);
    return { ok: true };
  }

  @Delete('sessions/:id')
  async endSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.chat.endSession(id);
    return { ok: true };
  }
}
