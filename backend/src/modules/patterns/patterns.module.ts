import { Module } from '@nestjs/common';
import { PatternsRepository } from './infrastructure/patterns.repository';
import { PatternsService } from './application/patterns.service';
import { PatternsController } from './presentation/patterns.controller';

@Module({
  controllers: [PatternsController],
  providers: [PatternsRepository, PatternsService],
  exports: [PatternsService],
})
export class PatternsModule {}
