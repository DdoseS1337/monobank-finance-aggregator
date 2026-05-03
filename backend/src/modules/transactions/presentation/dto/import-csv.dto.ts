import { IsUUID } from 'class-validator';

export class ImportCsvDto {
  @IsUUID()
  accountId: string;
}
