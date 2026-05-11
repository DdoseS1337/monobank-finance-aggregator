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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../../auth/supabase.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../auth/current-user.decorator';
import { RulesService } from '../application/rules.service';
import { Rule } from '../domain/rule.entity';
import {
  CreateFromTemplateDto,
  CreateRuleDto,
  DryRunRuleDto,
  UpdateRuleDto,
} from './dto/rule-dto';
import { findTemplate, RULE_TEMPLATES } from '../templates/predefined-templates';

interface RuleResponse {
  id: string;
  name: string;
  description: string | null;
  trigger: unknown;
  condition: unknown;
  actions: unknown;
  priority: number;
  cooldownSeconds: number;
  enabled: boolean;
  lastExecutedAt: string | null;
  executionCount: number;
}

function mapRule(r: Rule): RuleResponse {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    trigger: r.trigger,
    condition: r.condition,
    actions: r.actions,
    priority: r.priority,
    cooldownSeconds: r.cooldownSeconds,
    enabled: r.enabled,
    lastExecutedAt: r.lastExecutedAt?.toISOString() ?? null,
    executionCount: r.executionCount,
  };
}

@ApiTags('rules')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('rules')
export class RulesController {
  constructor(private readonly service: RulesService) {}

  @Get('templates')
  listTemplates() {
    return RULE_TEMPLATES.map((t) => ({
      templateId: t.templateId,
      title: t.title,
      description: t.description,
      params: t.params,
    }));
  }

  @Post('from-template')
  async createFromTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFromTemplateDto,
  ): Promise<RuleResponse> {
    const template = findTemplate(dto.templateId);
    if (!template) {
      throw new BadRequestException(`Unknown template: ${dto.templateId}`);
    }
    const missing = template.params
      .filter((p) => p.required && dto.values[p.key] === undefined)
      .map((p) => p.key);
    if (missing.length > 0) {
      throw new BadRequestException(`Missing required params: ${missing.join(', ')}`);
    }
    const input = template.build(user.id, dto.values);
    const rule = await this.service.createRule(input);
    return mapRule(rule);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRuleDto,
  ): Promise<RuleResponse> {
    const rule = await this.service.createRule({ userId: user.id, ...dto });
    return mapRule(rule);
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<RuleResponse[]> {
    const rules = await this.service.listRules(user.id);
    return rules.map(mapRule);
  }

  @Get(':id')
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RuleResponse> {
    const rule = await this.service.getRule(user.id, id);
    return mapRule(rule);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRuleDto,
  ): Promise<RuleResponse> {
    const rule = await this.service.updateRule(user.id, id, dto);
    return mapRule(rule);
  }

  @Post(':id/enable')
  async enable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RuleResponse> {
    const rule = await this.service.enable(user.id, id);
    return mapRule(rule);
  }

  @Post(':id/disable')
  async disable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RuleResponse> {
    const rule = await this.service.disable(user.id, id);
    return mapRule(rule);
  }

  @Post(':id/dry-run')
  async dryRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DryRunRuleDto,
  ) {
    return this.service.dryRun(user.id, id, dto.ctx);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ ok: true }> {
    await this.service.delete(user.id, id);
    return { ok: true };
  }
}
