import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { PgliteDialect } from '@soapbox/kysely-pglite';
import { Kysely } from 'kysely';

import { DittoDatabase, DittoDatabaseOpts } from '@/db/DittoDatabase.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { KyselyLogger } from '@/db/KyselyLogger.ts';

export class DittoPglite {
  static create(databaseUrl: string, opts?: DittoDatabaseOpts): DittoDatabase {
    const kysely = new Kysely<DittoTables>({
      dialect: new PgliteDialect({
        database: new PGlite(databaseUrl, {
          extensions: { pg_trgm },
          debug: opts?.debug,
        }),
      }),
      log: KyselyLogger,
    });

    return {
      kysely,
      poolSize: 1,
      availableConnections: 1,
    };
  }
}
