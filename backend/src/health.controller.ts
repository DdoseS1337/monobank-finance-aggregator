import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([]);
  }

  /**
   * Read-only diagnostic for the eval harness so it can verify which
   * configuration is active before a run. NOT authenticated on purpose —
   * exposes only boolean flags, no secrets.
   */
  @Get('config')
  getConfig() {
    const verificationEnabled =
      this.config.get<string>('AI_VERIFICATION_ENABLED', 'true') !== 'false';
    return {
      ai: {
        verificationEnabled,
        defaultModel: this.config.get<string>('OPENAI_MODEL_DEFAULT', 'gpt-4o'),
        cheapModel: this.config.get<string>('OPENAI_MODEL_CHEAP', 'gpt-4o-mini'),
      },
    };
  }
}
