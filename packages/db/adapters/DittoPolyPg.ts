import fs from 'node:fs/promises';
import path from 'node:path';

import { logi } from '@soapbox/logi';
import { FileMigrationProvider, type Kysely, Migrator } from 'kysely';

import { DittoPglite } from './DittoPglite.ts';
import { DittoPostgres } from './DittoPostgres.ts';

import type { JsonValue } from '@std/json';
import type { DittoDB, DittoDBOpts } from '../DittoDB.ts';
import type { DittoTables } from '../DittoTables.ts';

/** Creates either a PGlite or Postgres connection depending on the databaseUrl. */
export class DittoPolyPg {
  /** Open a new database connection. */
  static create(databaseUrl: string, opts?: DittoDBOpts): DittoDB {
    const { protocol } = new URL(databaseUrl);

    switch (protocol) {
      case 'file:':
      case 'memory:':
        return DittoPglite.create(databaseUrl, opts);
      case 'postgres:':
      case 'postgresql:':
        return DittoPostgres.create(databaseUrl, opts);
      default:
        throw new Error('Unsupported database URL.');
    }
  }

  /** Migrate the database to the latest version. */
  static async migrate(kysely: Kysely<DittoTables>) {
    const migrator = new Migrator({
      db: kysely,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: new URL(import.meta.resolve('./migrations')).pathname,
      }),
    });

    logi({ level: 'info', ns: 'ditto.db.migration', msg: 'Running migrations...', state: 'started' });
    const { results, error } = await migrator.migrateToLatest();

    if (error) {
      logi({
        level: 'fatal',
        ns: 'ditto.db.migration',
        msg: 'Migration failed.',
        state: 'failed',
        results: results as unknown as JsonValue,
        error: error instanceof Error ? error : null,
      });
      throw new Error('Migration failed.');
    } else {
      if (!results?.length) {
        logi({ level: 'info', ns: 'ditto.db.migration', msg: 'Everything up-to-date.', state: 'skipped' });
      } else {
        logi({
          level: 'info',
          ns: 'ditto.db.migration',
          msg: 'Migrations finished!',
          state: 'migrated',
          results: results as unknown as JsonValue,
        });
      }
    }
  }
}
