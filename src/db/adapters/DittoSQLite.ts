import { PolySqliteDialect } from '@soapbox/kysely-deno-sqlite';
import { Kysely, sql } from 'kysely';

import { Conf } from '@/config.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { KyselyLogger } from '@/db/KyselyLogger.ts';
import SqliteWorker from '@/workers/sqlite.ts';

export class DittoSQLite {
  static db: Kysely<DittoTables> | undefined;

  static async getInstance(): Promise<Kysely<DittoTables>> {
    if (!this.db) {
      const sqliteWorker = new SqliteWorker();
      await sqliteWorker.open(this.path);

      this.db = new Kysely<DittoTables>({
        dialect: new PolySqliteDialect({
          database: sqliteWorker,
        }),
        log: KyselyLogger,
      });

      // Set PRAGMA values.
      await Promise.all([
        sql`PRAGMA synchronous = normal`.execute(this.db),
        sql`PRAGMA temp_store = memory`.execute(this.db),
        sql`PRAGMA foreign_keys = ON`.execute(this.db),
        sql`PRAGMA auto_vacuum = FULL`.execute(this.db),
        sql`PRAGMA journal_mode = WAL`.execute(this.db),
        sql.raw(`PRAGMA mmap_size = ${Conf.sqlite.mmapSize}`).execute(this.db),
      ]);
    }
    return this.db;
  }

  /** Get the relative or absolute path based on the `DATABASE_URL`. */
  static get path() {
    if (Deno.env.get('DATABASE_URL') === 'sqlite://:memory:') {
      return ':memory:';
    }

    const { host, pathname } = Conf.databaseUrl;

    if (!pathname) return '';

    // Get relative path.
    if (host === '') {
      return pathname;
    } else if (host === '.') {
      return pathname;
    } else if (host) {
      return host + pathname;
    }

    return '';
  }
}
