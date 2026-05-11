import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SupabaseAuthGuard } from '../../../auth/supabase.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../auth/current-user.decorator';
import { NotificationsService } from '../application/notifications.service';
import { Notification } from '../domain/notification.entity';

class ListInboxQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

interface NotificationResponse {
  id: string;
  channel: string;
  kind: string;
  severity: string;
  payload: unknown;
  status: string;
  scheduledFor: string;
  retryCount: number;
}

function mapNotification(n: Notification): NotificationResponse {
  const s = n.toSnapshot();
  return {
    id: s.id,
    channel: s.channel,
    kind: s.kind,
    severity: s.severity,
    payload: s.payload,
    status: s.status,
    scheduledFor: s.scheduledFor.toISOString(),
    retryCount: s.retryCount,
  };
}

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get('inbox')
  async listInbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListInboxQueryDto,
  ): Promise<NotificationResponse[]> {
    const items = await this.service.listInbox(user.id, {
      unreadOnly: query.unreadOnly,
      limit: query.limit,
    });
    return items.map(mapNotification);
  }

  @Post(':id/opened')
  async markOpened(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ ok: true }> {
    await this.service.markOpened(user.id, id);
    return { ok: true };
  }

  @Post(':id/clicked')
  async markClicked(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ ok: true }> {
    await this.service.markClicked(user.id, id);
    return { ok: true };
  }

  @Post(':id/dismissed')
  async markDismissed(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ ok: true }> {
    await this.service.markDismissed(user.id, id);
    return { ok: true };
  }
}
