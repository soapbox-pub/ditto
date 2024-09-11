import { PGlite } from '@electric-sql/pglite';
import { PgliteDialect } from '@soapbox/kysely-pglite';
import { Kysely } from 'kysely';

import { Conf } from '@/config.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { KyselyLogger } from '@/db/KyselyLogger.ts';

export class DittoPglite {
  static db: Kysely<DittoTables> | undefined;

  // deno-lint-ignore require-await
  static async getInstance(): Promise<Kysely<DittoTables>> {
    if (!this.db) {
      this.db = new Kysely<DittoTables>({
        dialect: new PgliteDialect({
          database: new PGlite(Conf.databaseUrl),
        }),
        log: KyselyLogger,
      }) as Kysely<DittoTables>;
    }

    return this.db;
  }

  static get poolSize() {
    return 1;
  }

  static get availableConnections(): number {
    return 1;
  }
}
