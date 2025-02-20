import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { PgliteDialect } from '@soapbox/kysely-pglite';
import { Kysely } from 'kysely';

import { KyselyLogger } from '../KyselyLogger.ts';
import { isWorker } from '../utils/worker.ts';

import type { DittoDB, DittoDBOpts } from '../DittoDB.ts';
import type { DittoTables } from '../DittoTables.ts';

export class DittoPglite {
  static create(databaseUrl: string, opts?: DittoDBOpts): DittoDB {
    const url = new URL(databaseUrl);

    if (url.protocol === 'file:' && isWorker()) {
      throw new Error('PGlite is not supported in worker threads.');
    }

    const pglite = new PGlite(databaseUrl, {
      extensions: { pg_trgm },
      debug: opts?.debug,
    });

    const kysely = new Kysely<DittoTables>({
      dialect: new PgliteDialect({ database: pglite }),
      log: KyselyLogger,
    });

    const listen = (channel: string, callback: (payload: string) => void): void => {
      pglite.listen(channel, callback);
    };

    return {
      kysely,
      poolSize: 1,
      availableConnections: 1,
      listen,
      [Symbol.asyncDispose]: async () => {
        await pglite.close();
        await kysely.destroy();
      },
    };
  }
}
