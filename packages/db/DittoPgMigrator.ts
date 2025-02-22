import fs from 'node:fs/promises';
import path from 'node:path';

import { logi } from '@soapbox/logi';
import { FileMigrationProvider, type Kysely, Migrator } from 'kysely';

import type { JsonValue } from '@std/json';

export class DittoPgMigrator {
  private migrator: Migrator;

  // deno-lint-ignore no-explicit-any
  constructor(private kysely: Kysely<any>) {
    this.migrator = new Migrator({
      db: this.kysely,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: new URL(import.meta.resolve('./migrations')).pathname,
      }),
    });
  }

  async migrate(): Promise<void> {
    logi({ level: 'info', ns: 'ditto.db.migration', msg: 'Running migrations...', state: 'started' });
    const { results, error } = await this.migrator.migrateToLatest();

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
