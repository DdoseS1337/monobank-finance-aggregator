import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkersModule } from './workers.module';

/**
 * Workers entrypoint (separate process).
 * Hosts all BullMQ Processors. AppModule is for HTTP API only.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkersModule, {
    bufferLogs: true,
  });
  app.enableShutdownHooks();

  const shutdown = async (): Promise<void> => {
    Logger.log('Shutting down workers…', 'Workers');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  Logger.log('PFOS workers running', 'Workers');
}

void bootstrap();
