import ISO6391, { LanguageCode } from 'iso-639-1';
import lande from 'lande';
import { NostrEvent } from '@nostrify/nostrify';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { Conf } from '@/config.ts';
import { DittoDB } from '@/db/DittoDB.ts';
import { EventsDB } from '@/storages/EventsDB.ts';
import { purifyEvent } from '@/utils/purify.ts';
import { sql } from 'kysely';

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
export async function createTestDB(opts?: { pure?: boolean }) {
  const { testDatabaseUrl } = Conf;
  const { kysely } = DittoDB.create(testDatabaseUrl, { poolSize: 1 });

  await DittoDB.migrate(kysely);

  const store = new EventsDB({
    kysely,
    timeout: Conf.db.timeouts.default,
    pubkey: Conf.pubkey,
    pure: opts?.pure ?? false,
  });

  return {
    store,
    kysely,
    [Symbol.asyncDispose]: async () => {
      const { rows } = await sql<
        { tablename: string }
      >`select tablename from pg_tables where schemaname = current_schema()`.execute(kysely);

      for (const { tablename } of rows) {
        await kysely.schema.dropTable(tablename).ifExists().cascade().execute();
      }

      await kysely.destroy();
    },
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getLanguage(text: string): LanguageCode | undefined {
  const [topResult] = lande(text);
  if (topResult) {
    const [iso6393] = topResult;
    const locale = new Intl.Locale(iso6393);
    if (ISO6391.validate(locale.language)) {
      return locale.language as LanguageCode;
    }
  }
  return;
}
