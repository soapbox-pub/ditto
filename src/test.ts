import fs from 'node:fs/promises';
import path from 'node:path';

import { Database as Sqlite } from '@db/sqlite';
import { NDatabase, NostrEvent } from '@nostrify/nostrify';
import { DenoSqlite3Dialect } from '@soapbox/kysely-deno-sqlite';
import { FileMigrationProvider, Kysely, Migrator } from 'kysely';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { DittoTables } from '@/db/DittoTables.ts';
import { purifyEvent } from '@/storages/hydrate.ts';

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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
