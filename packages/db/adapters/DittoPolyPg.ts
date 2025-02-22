import { DittoPglite } from './DittoPglite.ts';
import { DittoPostgres } from './DittoPostgres.ts';

import type { Kysely } from 'kysely';
import type { DittoDB, DittoDBOpts } from '../DittoDB.ts';
import type { DittoTables } from '../DittoTables.ts';

/** Creates either a PGlite or Postgres connection depending on the databaseUrl. */
export class DittoPolyPg implements DittoDB {
  private adapter: DittoDB;

  /** Open a new database connection. */
  constructor(databaseUrl: string, opts?: DittoDBOpts) {
    const { protocol } = new URL(databaseUrl);

    switch (protocol) {
      case 'file:':
      case 'memory:':
        this.adapter = new DittoPglite(databaseUrl, opts);
        break;
      case 'postgres:':
      case 'postgresql:':
        this.adapter = new DittoPostgres(databaseUrl, opts);
        break;
      default:
        throw new Error('Unsupported database URL.');
    }
  }

  get kysely(): Kysely<DittoTables> {
    return this.adapter.kysely;
  }

  async migrate(): Promise<void> {
    await this.adapter.migrate();
  }

  listen(channel: string, callback: (payload: string) => void): void {
    this.adapter.listen(channel, callback);
  }

  get poolSize(): number {
    return this.adapter.poolSize;
  }

  get availableConnections(): number {
    return this.adapter.availableConnections;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.adapter[Symbol.asyncDispose]();
  }
}
