import fs from 'node:fs/promises';
import path from 'node:path';

import { NDatabaseSchema, NPostgresSchema } from '@nostrify/db';
import { FileMigrationProvider, Kysely, Migrator } from 'kysely';

import { Conf } from '@/config.ts';
import { DittoPostgres } from '@/db/adapters/DittoPostgres.ts';
import { DittoSQLite } from '@/db/adapters/DittoSQLite.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { EventsDB } from '@/storages/EventsDB.ts';

export type DittoDatabase = {
  dialect: 'sqlite';
  store: EventsDB;
  kysely: Kysely<DittoTables> & Kysely<NDatabaseSchema>;
} | {
  dialect: 'postgres';
  store: EventsDB;
  kysely: Kysely<DittoTables> & Kysely<NPostgresSchema>;
};

export class DittoDB {
  private static db: Promise<DittoDatabase> | undefined;

  static getInstance(): Promise<DittoDatabase> {
    if (!this.db) {
      this.db = this._getInstance();
    }
    return this.db;
  }

  static async _getInstance(): Promise<DittoDatabase> {
    const result = {} as DittoDatabase;

    switch (Conf.db.dialect) {
      case 'sqlite':
        result.dialect = 'sqlite';
        result.kysely = await DittoSQLite.getInstance();
        result.store = new EventsDB(result.kysely as any);
        break;
      case 'postgres':
        result.dialect = 'postgres';
        result.kysely = await DittoPostgres.getInstance();
        result.store = new EventsDB(result.kysely as any);
        break;
      default:
        throw new Error('Unsupported database URL.');
    }

    await this.migrate(result.kysely);

    return result;
  }

  static get poolSize(): number {
    if (Conf.db.dialect === 'postgres') {
      return DittoPostgres.poolSize;
    }
    return 1;
  }

  static get availableConnections(): number {
    if (Conf.db.dialect === 'postgres') {
      return DittoPostgres.availableConnections;
    }
    return 1;
  }

  /** Migrate the database to the latest version. */
  static async migrate(kysely: DittoDatabase['kysely']) {
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
