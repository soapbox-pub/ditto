import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { PgliteDialect } from '@soapbox/kysely-pglite';
import { Kysely } from 'kysely';

import { KyselyLogger } from '../KyselyLogger.ts';
import { DittoPgMigrator } from '../DittoPgMigrator.ts';
import { isWorker } from '../utils/worker.ts';

import type { DittoDB, DittoDBOpts } from '../DittoDB.ts';
import type { DittoTables } from '../DittoTables.ts';

export class DittoPglite implements DittoDB {
  readonly poolSize = 1;
  readonly availableConnections = 1;
  readonly kysely: Kysely<DittoTables>;

  private pglite: PGlite;
  private migrator: DittoPgMigrator;

  constructor(databaseUrl: string, opts?: DittoDBOpts) {
    const url = new URL(databaseUrl);

    if (url.protocol === 'file:' && isWorker()) {
      throw new Error('PGlite is not supported in worker threads.');
    }

    this.pglite = new PGlite(databaseUrl, {
      extensions: { pg_trgm },
      debug: opts?.debug,
    });

    this.kysely = new Kysely<DittoTables>({
      dialect: new PgliteDialect({ database: this.pglite }),
      log: KyselyLogger,
    });

    this.migrator = new DittoPgMigrator(this.kysely);
  }

  listen(channel: string, callback: (payload: string) => void): void {
    this.pglite.listen(channel, callback);
  }

  async migrate(): Promise<void> {
    await this.migrator.migrate();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.pglite.close();
    await this.kysely.destroy();
  }
}
