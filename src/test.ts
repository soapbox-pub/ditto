import { NostrEvent } from '@nostrify/nostrify';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { Conf } from '@/config.ts';
import { DittoDB } from '@/db/DittoDB.ts';
import { EventsDB } from '@/storages/EventsDB.ts';
import { purifyEvent } from '@/utils/purify.ts';

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

/** Create a database for testing. It uses `TEST_DATABASE_URL`, or creates an in-memory database by default. */
export async function createTestDB() {
  const { testDatabaseUrl } = Conf;
  const { protocol } = new URL(testDatabaseUrl);
  const { kysely } = DittoDB.create(testDatabaseUrl, { poolSize: 1 });

  await DittoDB.migrate(kysely);

  const store = new EventsDB({
    kysely,
    timeout: Conf.db.timeouts.default,
    pubkey: Conf.pubkey,
  });

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
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
