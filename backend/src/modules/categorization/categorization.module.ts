import { Module } from '@nestjs/common';
import { CategorizationService } from './application/categorization.service';
import { CategorizationSaga } from './application/categorization.saga';
import { CategoriesController } from './presentation/categories.controller';

/**
 * Categorization Context.
 *
 * Two responsibilities:
 *  1. Service: pure deterministic resolver (merchant rules → MCC → fallback).
 *  2. Saga: subscribes to `transaction.imported`, persists categoryId,
 *     emits `transaction.categorized`.
 *
 * Saga is inert in the API process; only WorkersModule activates it.
 */
@Module({
  controllers: [CategoriesController],
  providers: [CategorizationService, CategorizationSaga],
  exports: [CategorizationService, CategorizationSaga],
})
export class CategorizationModule {}
