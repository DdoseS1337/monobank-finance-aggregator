import { Module } from '@nestjs/common';
import { MemoryService } from './application/memory.service';
import { MemoryConsolidationService } from './application/consolidation.service';
import { MemoryDecayService } from './application/decay.service';
import { MemoryMaintenanceScheduler } from './application/memory-maintenance.scheduler';
import { PrismaMemoryRepository } from './infrastructure/memory.repository';
import { MEMORY_REPOSITORY } from './domain/repositories.interface';

/**
 * AI Memory submodule.
 *
 * Layered memory model (Atkinson-Shiffrin-inspired):
 *   - WORKING memory: lives in agent conversation context only.
 *   - EPISODIC: per-event records (user actions, outcomes).
 *   - SEMANTIC: stable preferences/facts (consolidated from episodic).
 *   - PROCEDURAL: learned playbooks (Phase 4.1 will populate from agent traces).
 */
@Module({
  providers: [
    MemoryService,
    MemoryConsolidationService,
    MemoryDecayService,
    MemoryMaintenanceScheduler,
    { provide: MEMORY_REPOSITORY, useClass: PrismaMemoryRepository },
  ],
  exports: [MemoryService, MemoryConsolidationService],
})
export class MemoryModule {}
