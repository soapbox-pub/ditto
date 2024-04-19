import { Conf } from '@/config.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { Kysely, PolySqliteDialect } from '@/deps.ts';
import { setPragma } from '@/pragma.ts';
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
      });

      // Set PRAGMA values.
      await Promise.all([
        setPragma(this.db, 'synchronous', 'normal'),
        setPragma(this.db, 'temp_store', 'memory'),
        setPragma(this.db, 'mmap_size', Conf.sqlite.mmapSize),
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
