import { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely';

import { DittoTables } from '@/db/DittoTables.ts';
import { PostgreSQLDriver } from 'https://deno.land/x/kysely_deno_postgres@v0.4.0/mod.ts';

export class DittoPostgres {
  static db: Kysely<DittoTables> | undefined;

  // deno-lint-ignore require-await
  static async getInstance(): Promise<Kysely<DittoTables>> {
    if (!this.db) {
      this.db = new Kysely({
        dialect: {
          createAdapter() {
            return new PostgresAdapter();
          },
          // @ts-ignore mismatched kysely versions probably
          createDriver() {
            return new PostgreSQLDriver({
              connectionString: Deno.env.get('DATABASE_URL'),
            });
          },
          createIntrospector(db: Kysely<unknown>) {
            return new PostgresIntrospector(db);
          },
          createQueryCompiler() {
            return new PostgresQueryCompiler();
          },
        },
      });
    }

    return this.db;
  }
}
