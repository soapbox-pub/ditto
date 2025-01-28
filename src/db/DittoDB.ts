import fs from 'node:fs/promises';
import path from 'node:path';

import { logi } from '@soapbox/logi';
import { JsonValue } from '@std/json';
import { FileMigrationProvider, Kysely, Migrator } from 'kysely';

import { DittoPglite } from '@/db/adapters/DittoPglite.ts';
import { DittoPostgres } from '@/db/adapters/DittoPostgres.ts';
import { DittoDatabase, DittoDatabaseOpts } from '@/db/DittoDatabase.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { errorJson } from '@/utils/log.ts';

export class DittoDB {
  /** Open a new database connection. */
  static create(databaseUrl: string, opts?: DittoDatabaseOpts): DittoDatabase {
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

    logi({ level: 'info', ns: 'ditto.db.migration', message: 'Running migrations...', state: 'started' });
    const { results, error } = await migrator.migrateToLatest();

    if (error) {
      logi({
        level: 'fatal',
        ns: 'ditto.db.migration',
        message: 'Migration failed.',
        state: 'failed',
        results: results as unknown as JsonValue,
        error: errorJson(error),
      });
      Deno.exit(1);
    } else {
      if (!results?.length) {
        logi({ level: 'info', ns: 'ditto.db.migration', message: 'Everything up-to-date.', state: 'skipped' });
      } else {
        logi({
          level: 'info',
          ns: 'ditto.db.migration',
          message: 'Migrations finished!',
          state: 'migrated',
          results: results as unknown as JsonValue,
        });
      }
    }
  }
}
