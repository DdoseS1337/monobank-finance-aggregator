import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { UIMessage } from 'ai';
import { SupabaseGuard } from '../../../auth/supabase.guard';
import { AuthUser, CurrentUser } from '../../../auth/current-user.decorator';
import { AiThreadRepository } from '../infrastructure/ai-thread.repository';
import { ChatService } from '../application/chat.service';
import { ModelRegistry, DEFAULT_MODEL } from '../infrastructure/model-registry';
import { CreateThreadDto, UpdateThreadDto } from './dto/chat.dto';
import type { AiModelId } from '../domain/ai.interfaces';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ChatBody {
  threadId?: unknown;
  model?: unknown;
  messages?: unknown;
}

@Controller('ai')
@UseGuards(SupabaseGuard)
export class AiController {
  constructor(
    private readonly chatService: ChatService,
    private readonly threadRepo: AiThreadRepository,
    private readonly modelRegistry: ModelRegistry,
  ) {}

  /** List available models (for the UI dropdown). */
  @Get('models')
  listModels() {
    return {
      models: this.modelRegistry.list(),
      default: DEFAULT_MODEL,
    };
  }

  /** List chat threads for current user. */
  @Get('threads')
  listThreads(@CurrentUser() user: AuthUser) {
    return this.threadRepo.listForUser(user.id);
  }

  /** Create a new thread. */
  @Post('threads')
  createThread(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateThreadDto,
  ) {
    return this.threadRepo.create(user.id, body.model ?? null);
  }

  /** Fetch one thread's metadata + all messages. */
  @Get('threads/:id')
  async getThread(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const thread = await this.threadRepo.findByIdForUser(id, user.id);
    const messages = await this.threadRepo.listMessages(id);
    return { thread, messages };
  }

  @Patch('threads/:id')
  async updateThread(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateThreadDto,
  ) {
    await this.threadRepo.findByIdForUser(id, user.id); // auth check
    await this.threadRepo.updateMeta(id, body);
    return { ok: true };
  }

  @Delete('threads/:id')
  async deleteThread(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.threadRepo.deleteForUser(id, user.id);
    return { ok: true };
  }

  /**
   * Streaming chat endpoint (SSE). Reads body directly from `req.body` to
   * bypass the global ValidationPipe — when `whitelist: true` is combined
   * with an interface param (no class with decorators), the pipe strips
   * all fields. AI SDK controls the payload shape; we validate manually.
   */
  @Post('chat')
  async chat(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const body = (req.body ?? {}) as ChatBody;
    const threadId = typeof body?.threadId === 'string' ? body.threadId : '';
    if (!UUID_RE.test(threadId)) {
      throw new BadRequestException('threadId must be a UUID');
    }
    if (!Array.isArray(body?.messages)) {
      throw new BadRequestException('messages must be an array');
    }
    const model =
      typeof body.model === 'string' ? (body.model as AiModelId) : undefined;

    await this.chatService.chat({
      userId: user.id,
      threadId,
      messages: body.messages as UIMessage[],
      model,
      res: res as unknown as import('http').ServerResponse,
    });
  }
}
