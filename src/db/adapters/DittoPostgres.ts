import { Kysely } from 'kysely';
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from 'postgres';

import { Conf } from '@/config.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { KyselyLogger } from '@/db/KyselyLogger.ts';

export class DittoPostgres {
  static db: Kysely<DittoTables> | undefined;

  // deno-lint-ignore require-await
  static async getInstance(): Promise<Kysely<DittoTables>> {
    if (!this.db) {
      this.db = new Kysely({
        dialect: new PostgresJSDialect({
          postgres: postgres(Conf.databaseUrl)
        }),
        log: KyselyLogger
      });
    }

    return this.db;
  }
}
