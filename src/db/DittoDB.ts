import fs from 'node:fs/promises';
import path from 'node:path';

import { FileMigrationProvider, Kysely, Migrator } from 'kysely';

import { DittoPglite } from '@/db/adapters/DittoPglite.ts';
import { DittoPostgres } from '@/db/adapters/DittoPostgres.ts';
import { DittoDatabase, DittoDatabaseOpts } from '@/db/DittoDatabase.ts';
import { DittoTables } from '@/db/DittoTables.ts';

export class DittoDB {
  /** Open a new database connection. */
  static create(databaseUrl: string, opts?: DittoDatabaseOpts): DittoDatabase {
    const { protocol } = new URL(databaseUrl);

    switch (protocol) {
      case 'file:':
      case 'memory:':
        return DittoPglite.create(databaseUrl);
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

    console.warn('Running migrations...');
    const { results, error } = await migrator.migrateToLatest();

    if (error) {
      console.error(error);
      Deno.exit(1);
    } else {
      if (!results?.length) {
        console.warn('Everything up-to-date.');
      } else {
        console.warn('Migrations finished!');
        for (const { migrationName, status } of results!) {
          console.warn(`  - ${migrationName}: ${status}`);
        }
      }
    }
  }
}
