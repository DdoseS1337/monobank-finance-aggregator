import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SupabaseGuard } from '../../../auth/supabase.guard';
import { CurrentUser, AuthUser } from '../../../auth/current-user.decorator';
import { TransactionIngestionService } from '../application/transaction-ingestion.service';
import { TransactionQueryService } from '../application/transaction-query.service';
import { CsvImportService } from '../application/csv-import.service';
import { ManualTransactionService } from '../application/manual-transaction.service';
import { SyncTransactionsDto } from './dto/sync-transactions.dto';
import { ManualTransactionDto } from './dto/manual-transaction.dto';

@Controller('transactions')
@UseGuards(SupabaseGuard)
export class TransactionsController {
  constructor(
    private readonly ingestionService: TransactionIngestionService,
    private readonly queryService: TransactionQueryService,
    private readonly csvImportService: CsvImportService,
    private readonly manualTransactionService: ManualTransactionService,
  ) {}

  @Get('accounts')
  async getAccounts(
    @CurrentUser() user: AuthUser,
    @Query('source') source: string = 'monobank',
    @Query('token') token?: string,
  ) {
    if (!token) {
      return { error: 'token query param is required' };
    }
    return this.ingestionService.getAccounts(source, token);
  }

  @Post('sync')
  async syncTransactions(
    @CurrentUser() user: AuthUser,
    @Body() dto: SyncTransactionsDto,
  ) {
    return this.ingestionService.syncTransactions(
      user.id,
      dto.source,
      dto.token,
      dto.accountId,
      new Date(dto.from),
      new Date(dto.to),
    );
  }

  @Post('import/csv')
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('accountId') accountId: string,
  ) {
    if (!file) throw new BadRequestException('file is required');
    if (!accountId) throw new BadRequestException('accountId is required');
    return this.csvImportService.importCsv(user.id, accountId, file.buffer);
  }

  @Post('manual')
  async createManual(
    @CurrentUser() user: AuthUser,
    @Body() dto: ManualTransactionDto,
  ) {
    return this.manualTransactionService.create(user.id, dto);
  }

  @Get()
  async getTransactions(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('category') category?: string,
    @Query('type') type?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const allowedTypes = ['DEBIT', 'CREDIT', 'TRANSFER', 'HOLD'];
    const transactionType =
      type && allowedTypes.includes(type) ? type : undefined;

    return this.queryService.getTransactions(user.id, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      mccCategory: category,
      transactionType,
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined,
    });
  }
}
