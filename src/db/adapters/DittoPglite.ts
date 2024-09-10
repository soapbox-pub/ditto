import { PGlite } from '@electric-sql/pglite';
import { NPostgresSchema } from '@nostrify/db';
import { PgliteDialect } from '@soapbox/kysely-pglite';
import { Kysely } from 'kysely';

import { Conf } from '@/config.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { KyselyLogger } from '@/db/KyselyLogger.ts';

export class DittoPglite {
  static db: Kysely<DittoTables> & Kysely<NPostgresSchema> | undefined;

  // deno-lint-ignore require-await
  static async getInstance(): Promise<Kysely<DittoTables> & Kysely<NPostgresSchema>> {
    if (!this.db) {
      this.db = new Kysely({
        dialect: new PgliteDialect({
          database: new PGlite(this.path),
        }),
        log: KyselyLogger,
      }) as Kysely<DittoTables> & Kysely<NPostgresSchema>;
    }

    return this.db;
  }

  static get poolSize() {
    return 1;
  }

  static get availableConnections(): number {
    return 1;
  }

  /** Get the relative or absolute path based on the `DATABASE_URL`. */
  static get path(): string | undefined {
    if (Conf.databaseUrl === 'pglite://:memory:') {
      return undefined;
    }

    const { host, pathname } = Conf.db.url;

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
