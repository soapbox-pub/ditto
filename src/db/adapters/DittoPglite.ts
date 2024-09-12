import { PGlite } from '@electric-sql/pglite';
import { PgliteDialect } from '@soapbox/kysely-pglite';
import { Kysely } from 'kysely';

import { DittoDatabase } from '@/db/DittoDatabase.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { KyselyLogger } from '@/db/KyselyLogger.ts';

export class DittoPglite {
  static create(databaseUrl: string): DittoDatabase {
    const pglite = new PGlite(databaseUrl);

    const kysely = new Kysely<DittoTables>({
      dialect: new PgliteDialect({
        database: pglite,
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
