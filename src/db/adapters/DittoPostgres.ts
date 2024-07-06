import { Kysely } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import postgres from 'postgres';

import { Conf } from '@/config.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { KyselyLogger } from '@/db/KyselyLogger.ts';

export class DittoPostgres {
  static db: Kysely<DittoTables> | undefined;
  static postgres: postgres.Sql;

  // deno-lint-ignore require-await
  static async getInstance(): Promise<Kysely<DittoTables>> {
    if (!this.postgres) {
      this.postgres = postgres(Conf.databaseUrl, { max: Conf.pg.poolSize });
    }

    if (!this.db) {
      this.db = new Kysely({
        dialect: new PostgresJSDialect({
          postgres: this.postgres as any,
        }),
        log: KyselyLogger,
      });
    }

    return this.db;
  }

  static get poolSize() {
    return Conf.pg.poolSize;
  }

  static get availableConnections(): number {
    return this.postgres.availableConnections;
  }
}
