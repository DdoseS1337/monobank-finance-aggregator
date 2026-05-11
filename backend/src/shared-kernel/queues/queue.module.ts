import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ALL_QUEUE_NAMES } from './queue-names';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');
        const parsed = new URL(url);
        return {
          connection: {
            host: parsed.hostname,
            port: Number(parsed.port || 6379),
            password: parsed.password || undefined,
            username: parsed.username || undefined,
            db: parsed.pathname ? Number(parsed.pathname.replace('/', '')) || 0 : 0,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    BullModule.registerQueue(...ALL_QUEUE_NAMES.map((name) => ({ name }))),
  ],
  exports: [BullModule],
})
export class QueueModule {}
