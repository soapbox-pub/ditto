import { Conf } from '@/config.ts';
import { DittoPostgres } from '@/db/adapters/DittoPostgres.ts';
import { DittoSQLite } from '@/db/adapters/DittoSQLite.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { Kysely } from '@/deps.ts';

export class DittoDB {
  static getInstance(): Promise<Kysely<DittoTables>> {
    const { databaseUrl } = Conf;

    switch (databaseUrl.protocol) {
      case 'sqlite:':
        return DittoSQLite.getInstance();
      case 'postgres:':
      case 'postgresql:':
        return DittoPostgres.getInstance();
      default:
        throw new Error('Unsupported database URL.');
    }
  }
}
