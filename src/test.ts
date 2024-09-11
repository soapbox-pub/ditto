import { PGlite } from '@electric-sql/pglite';
import { NostrEvent } from '@nostrify/nostrify';
import { PgliteDialect } from '@soapbox/kysely-pglite';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import { Kysely } from 'kysely';
import { PostgresJSDialect, PostgresJSDialectConfig } from 'kysely-postgres-js';
import postgres from 'postgres';

import { Conf } from '@/config.ts';
import { DittoDB } from '@/db/DittoDB.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { purifyEvent } from '@/storages/hydrate.ts';
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

/** Create an database for testing. */
export const createTestDB = async (databaseUrl = Conf.testDatabaseUrl) => {
  const { protocol } = new URL(databaseUrl);

  const kysely: Kysely<DittoTables> = (() => {
    switch (protocol) {
      case 'postgres:':
      case 'postgresql:':
        return new Kysely({
          // @ts-ignore Kysely version mismatch.
          dialect: new PostgresJSDialect({
            postgres: postgres(databaseUrl, {
              max: Conf.pg.poolSize,
            }) as unknown as PostgresJSDialectConfig['postgres'],
          }),
          log: KyselyLogger,
        });
      case 'file:':
      case 'memory:':
        return new Kysely({
          dialect: new PgliteDialect({
            database: new PGlite(databaseUrl),
          }),
        });
      default:
        throw new Error(`Unsupported database URL protocol: ${protocol}`);
    }
  })();

  await DittoDB.migrate(kysely);
  const store = new EventsDB(kysely);

  return {
    store,
    kysely,
    [Symbol.asyncDispose]: async () => {
      // If we're testing against real Postgres, we will reuse the database
      // between tests, so we should drop the tables to keep each test fresh.
      if (['postgres:', 'postgresql:'].includes(protocol)) {
        for (
          const table of [
            'author_stats',
            'event_stats',
            'event_zaps',
            'kysely_migration',
            'kysely_migration_lock',
            'nip46_tokens',
            'pubkey_domains',
            'nostr_events',
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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
