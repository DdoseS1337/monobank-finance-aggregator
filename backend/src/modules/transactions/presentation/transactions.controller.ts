import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../../auth/supabase.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../auth/current-user.decorator';
import { TransactionsService } from '../application/transactions.service';
import { MonobankImportService } from '../application/monobank-import.service';
import { SpendingDecompositionService } from '../application/spending-decomposition.service';
import { Transaction } from '../domain/transaction.entity';
import {
  ImportTransactionsDto,
  ListTransactionsQueryDto,
  RecategorizeDto,
  SpendingDecompositionQueryDto,
  SpendingSummaryQueryDto,
} from './dto/transactions-dto';

interface TransactionResponse {
  id: string;
  accountId: string;
  amount: string;
  currency: string;
  type: string;
  status: string;
  description: string | null;
  merchantName: string | null;
  mccCode: number | null;
  categoryId: string | null;
  isRecurring: boolean;
  isAnomaly: boolean;
  anomalyScore: number | null;
  transactionDate: string;
  importedAt: string;
}

function mapTransaction(t: Transaction): TransactionResponse {
  const s = t.toSnapshot();
  return {
    id: s.id,
    accountId: s.accountId,
    amount: s.amount.toFixed(2),
    currency: s.amount.currency,
    type: s.type,
    status: s.status,
    description: s.description,
    merchantName: s.merchantName,
    mccCode: s.mccCode,
    categoryId: s.categoryId,
    isRecurring: s.isRecurring,
    isAnomaly: s.isAnomaly,
    anomalyScore: s.anomalyScore,
    transactionDate: s.transactionDate.toISOString(),
    importedAt: s.importedAt.toISOString(),
  };
}

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly importer: MonobankImportService,
    private readonly decomposition: SpendingDecompositionService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTransactionsQueryDto,
  ) {
    const page = await this.transactions.list(user.id, {
      accountIds: query.accountIds,
      categoryIds: query.categoryIds,
      from: query.from,
      to: query.to,
      type: query.type,
      isAnomaly: query.isAnomaly,
      search: query.search,
      limit: query.limit,
      cursor: query.cursor,
    });
    return {
      items: page.items.map(mapTransaction),
      nextCursor: page.nextCursor,
    };
  }

  @Get('spending-summary')
  async spendingSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SpendingSummaryQueryDto,
  ) {
    return this.transactions.spendingSummary(user.id, {
      from: query.from,
      to: query.to,
    });
  }

  @Get('spending-decomposition')
  async spendingDecomposition(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SpendingDecompositionQueryDto,
  ) {
    return this.decomposition.decompose({
      userId: user.id,
      periodA: { from: query.fromA, to: query.toA },
      periodB: { from: query.fromB, to: query.toB },
      groupBy: query.groupBy,
    });
  }

  @Get(':id')
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TransactionResponse> {
    const tx = await this.transactions.getOne(user.id, id);
    return mapTransaction(tx);
  }

  @Patch(':id/category')
  async recategorize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RecategorizeDto,
  ): Promise<TransactionResponse> {
    const tx = await this.transactions.recategorize(user.id, id, dto.newCategoryId);
    return mapTransaction(tx);
  }

  @Post('accounts/:accountId/import')
  async runImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Body() dto: ImportTransactionsDto,
  ) {
    const result = await this.importer.importIncremental(
      user.id,
      accountId,
      dto.sinceDays ?? 1,
    );
    return result;
  }

  @Post('accounts/:accountId/import/backfill')
  async runBackfill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Body() dto: ImportTransactionsDto,
  ) {
    const days = dto.sinceDays ?? 31;
    const results = await this.importer.importBackfill(user.id, accountId, days);
    const totals = results.reduce(
      (acc, r) => ({
        fetched: acc.fetched + r.fetched,
        inserted: acc.inserted + r.inserted,
        skipped: acc.skipped + r.skipped,
      }),
      { fetched: 0, inserted: 0, skipped: 0 },
    );
    return { slices: results, totals };
  }
}
