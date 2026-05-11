import { Global, Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { LlmService } from './llm.service';

/**
 * Global module providing shared AI capabilities (embeddings, chat).
 * Imported once at the kernel level so any context can inject `EmbeddingService`
 * or `LlmService` without re-wiring config.
 */
@Global()
@Module({
  providers: [EmbeddingService, LlmService],
  exports: [EmbeddingService, LlmService],
})
export class AiKernelModule {}
