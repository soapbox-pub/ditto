import fs from 'node:fs/promises';
import path from 'node:path';

import { FileMigrationProvider, Kysely, Migrator } from 'kysely';

import { Conf } from '@/config.ts';
import { DittoPostgres } from '@/db/adapters/DittoPostgres.ts';
import { DittoSQLite } from '@/db/adapters/DittoSQLite.ts';
import { DittoTables } from '@/db/DittoTables.ts';

export class DittoDB {
  private static kysely: Promise<Kysely<DittoTables>> | undefined;

  static getInstance(): Promise<Kysely<DittoTables>> {
    if (!this.kysely) {
      this.kysely = this._getInstance();
    }
    return this.kysely;
  }

  static async _getInstance(): Promise<Kysely<DittoTables>> {
    let kysely: Kysely<DittoTables>;

    switch (Conf.db.dialect) {
      case 'sqlite':
        kysely = await DittoSQLite.getInstance();
        break;
      case 'postgres':
        kysely = await DittoPostgres.getInstance();
        break;
      default:
        throw new Error('Unsupported database URL.');
    }

    await this.migrate(kysely);

    return kysely;
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

    console.info('Running migrations...');
    const results = await migrator.migrateToLatest();

    if (results.error) {
      console.error(results.error);
      Deno.exit(1);
    } else {
      if (!results.results?.length) {
        console.info('Everything up-to-date.');
      } else {
        console.info('Migrations finished!');
        for (const { migrationName, status } of results.results!) {
          console.info(`  - ${migrationName}: ${status}`);
        }
      }
    }
  }
}
