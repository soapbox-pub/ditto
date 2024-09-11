import fs from 'node:fs/promises';
import path from 'node:path';

import { FileMigrationProvider, Kysely, Migrator } from 'kysely';

import { Conf } from '@/config.ts';
import { DittoPglite } from '@/db/adapters/DittoPglite.ts';
import { DittoPostgres } from '@/db/adapters/DittoPostgres.ts';
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
    const { protocol } = new URL(Conf.databaseUrl);

    let kysely: Kysely<DittoTables>;

    switch (protocol) {
      case 'file:':
      case 'memory:':
        kysely = await DittoPglite.getInstance();
        break;
      case 'postgres:':
      case 'postgresql:':
        kysely = await DittoPostgres.getInstance();
        break;
      default:
        throw new Error('Unsupported database URL.');
    }

    await this.migrate(kysely);

    return kysely;
  }

  static get poolSize(): number {
    const { protocol } = new URL(Conf.databaseUrl);

    if (['postgres:', 'postgresql:'].includes(protocol)) {
      return DittoPostgres.poolSize;
    }
    return 1;
  }

  static get availableConnections(): number {
    const { protocol } = new URL(Conf.databaseUrl);

    if (['postgres:', 'postgresql:'].includes(protocol)) {
      return DittoPostgres.availableConnections;
    }
    return 1;
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
