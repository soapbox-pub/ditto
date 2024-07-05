import fs from 'node:fs/promises';
import path from 'node:path';

import { Database as Sqlite } from '@db/sqlite';
import { NDatabase, NostrEvent } from '@nostrify/nostrify';
import { DenoSqlite3Dialect } from '@soapbox/kysely-deno-sqlite';
import {
  FileMigrationProvider,
  Kysely,
  Migrator,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { DittoDB } from '@/db/DittoDB.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { purifyEvent } from '@/storages/hydrate.ts';
import { PostgreSQLDriver } from 'kysely_deno_postgres';
import { Pool } from 'postgres';
import { KyselyLogger } from '@/db/KyselyLogger.ts';
import { EventsDB } from '@/storages/EventsDB.ts';

/** Import an event fixture by name in tests. */
export async function eventFixture(name: string): Promise<NostrEvent> {
  const result = await import(`~/fixtures/events/${name}.json`, { with: { type: 'json' } });
  return structuredClone(result.default);
}

/** Import a JSONL fixture by name in tests. */
export async function jsonlEvents(path: string): Promise<NostrEvent[]> {
  const data = await Deno.readTextFile(path);
  return data.split('\n').map((line) => JSON.parse(line));
}

/** Generate an event for use in tests. */
export function genEvent(t: Partial<NostrEvent> = {}, sk: Uint8Array = generateSecretKey()): NostrEvent {
  const event = finalizeEvent({
    kind: 255,
    created_at: 0,
    content: '',
    tags: [],
    ...t,
  }, sk);

  return purifyEvent(event);
}

/** Get an in-memory SQLite database to use for testing. It's automatically destroyed when it goes out of scope. */
export async function getTestDB() {
  const kysely = new Kysely<DittoTables>({
    dialect: new DenoSqlite3Dialect({
      database: new Sqlite(':memory:'),
    }),
  });

  const migrator = new Migrator({
    db: kysely,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: new URL(import.meta.resolve('./db/migrations')).pathname,
    }),
  });

  await migrator.migrateToLatest();

  const store = new NDatabase(kysely);

  return {
    store,
    kysely,
    [Symbol.asyncDispose]: () => kysely.destroy(),
  };
}

/** Create an database for testing. */
export const createTestDB = async (databaseUrl?: string) => {
  databaseUrl ??= Deno.env.get('DATABASE_URL') ?? 'sqlite://:memory:';

  const dialect: 'sqlite' | 'postgres' = (() => {
    const protocol = databaseUrl.split(':')[0];
    switch (protocol) {
      case 'sqlite':
        return 'sqlite';
      case 'postgres':
        return protocol;
      case 'postgresql':
        return 'postgres';
      default:
        throw new Error(`Unsupported protocol: ${protocol}`);
    }
  })();

  let kysely: Kysely<DittoTables>;

  if (dialect === 'sqlite') {
    // migration 021_pgfts_index.ts calls 'Conf.db.dialect',
    // and this calls the DATABASE_URL environment variable.
    // The following line ensures to NOT use the DATABASE_URL that may exist in an .env file.
    Deno.env.set('DATABASE_URL', 'sqlite://:memory:');

    kysely = new Kysely<DittoTables>({
      dialect: new DenoSqlite3Dialect({
        database: new Sqlite(':memory:'),
      }),
    });
  } else {
    kysely = new Kysely({
      dialect: {
        createAdapter() {
          return new PostgresAdapter();
        },
        createDriver() {
          return new PostgreSQLDriver(new Pool(databaseUrl, 10, true));
        },
        createIntrospector(db: Kysely<unknown>) {
          return new PostgresIntrospector(db);
        },
        createQueryCompiler() {
          return new PostgresQueryCompiler();
        },
      },
      log: KyselyLogger,
    });
  }
  await DittoDB.migrate(kysely);

  const store = new EventsDB(kysely);

  return {
    store,
    kysely,
    [Symbol.asyncDispose]: async () => {
      if (dialect === 'postgres') {
        for (
          const table of [
            'author_stats',
            'event_stats',
            'event_zaps',
            'kysely_migration',
            'kysely_migration_lock',
            'nip46_tokens',
            'pubkey_domains',
            'unattached_media',
            'nostr_events',
            'nostr_tags',
            'nostr_pgfts',
            'event_zaps',
          ]
        ) {
          await kysely.schema.dropTable(table).ifExists().cascade().execute();
        }
        await kysely.destroy();
      }
    },
  };
};
