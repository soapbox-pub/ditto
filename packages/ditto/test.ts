import { DittoDB } from '@ditto/db';
import { NostrEvent } from '@nostrify/nostrify';

import { Conf } from '@/config.ts';
import { EventsDB } from '@/storages/EventsDB.ts';
import { sql } from 'kysely';

/** Import an event fixture by name in tests. */
export async function eventFixture(name: string): Promise<NostrEvent> {
  const result = await import(`~/fixtures/events/${name}.json`, { with: { type: 'json' } });
  return structuredClone(result.default);
}

/** Create a database for testing. It uses `DATABASE_URL`, or creates an in-memory database by default. */
export async function createTestDB(opts?: { pure?: boolean }) {
  const { kysely } = DittoDB.create(Conf.databaseUrl, { poolSize: 1 });

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
        if (tablename.startsWith('kysely_')) continue;
        await sql`truncate table ${sql.ref(tablename)} cascade`.execute(kysely);
      }

      await kysely.destroy();
    },
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
