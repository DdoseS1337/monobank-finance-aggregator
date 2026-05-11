import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  ActionSpec,
  ConditionASTNode,
  EvaluationContext,
  TriggerSpec,
} from '../../domain/rule-schemas';

/**
 * We delegate Trigger/Condition/Actions validation to Zod inside the service.
 * `class-validator` only checks the wrapper shape — this keeps the
 * NestJS validation pipeline cheap and the deep schema in one canonical place.
 */
export class CreateRuleDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsObject()
  trigger!: TriggerSpec;

  @IsOptional()
  @IsObject()
  condition?: ConditionASTNode | null;

  @IsObject({ each: true })
  actions!: ActionSpec[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cooldownSeconds?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string | null;

  @IsOptional()
  @IsObject()
  condition?: ConditionASTNode | null;

  @IsOptional()
  @IsObject({ each: true })
  actions?: ActionSpec[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cooldownSeconds?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class DryRunRuleDto {
  @IsObject()
  ctx!: EvaluationContext;
}

export class CreateFromTemplateDto {
  @IsString()
  @IsNotEmpty()
  templateId!: string;

  @IsObject()
  values!: Record<string, unknown>;
}
