import { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely';
import { PostgreSQLDriver } from 'kysely_deno_postgres';
import { Pool } from 'postgres';

import { Conf } from '@/config.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { KyselyLogger } from '@/db/KyselyLogger.ts';

export class DittoPostgres {
  static db: Kysely<DittoTables> | undefined;
  static pool: Pool | undefined;

  static getPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool(Conf.databaseUrl, Conf.pg.poolSize, true);
    }
    return this.pool;
  }

  // deno-lint-ignore require-await
  static async getInstance(): Promise<Kysely<DittoTables>> {
    if (!this.db) {
      this.db = new Kysely({
        dialect: {
          createAdapter() {
            return new PostgresAdapter();
          },
          createDriver() {
            return new PostgreSQLDriver(DittoPostgres.getPool());
          },
          createIntrospector(db: Kysely<unknown>) {
            return new PostgresIntrospector(db);
          },
          createQueryCompiler() {
            return new PostgresQueryCompiler();
          },
        },
        log: KyselyLogger,
      });
    }

    return this.db;
  }
}
