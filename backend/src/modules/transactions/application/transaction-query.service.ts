import { Injectable } from '@nestjs/common';
import { Transaction } from '@prisma/client';
import {
  TransactionRepository,
  TransactionFilters,
} from '../infrastructure/repositories/transaction.repository';

@Injectable()
export class TransactionQueryService {
  constructor(private readonly transactionRepo: TransactionRepository) {}

  async getTransactions(
    userId: string,
    filters?: TransactionFilters,
  ): Promise<Transaction[]> {
    return this.transactionRepo.findByUserId(userId, filters);
  }
}
