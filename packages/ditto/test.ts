import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';
import { NostrEvent } from '@nostrify/nostrify';

import { DittoPgStore } from '@/storages/DittoPgStore.ts';
import { sql } from 'kysely';

/** Import an event fixture by name in tests. */
export async function eventFixture(name: string): Promise<NostrEvent> {
  const result = await import(`~/fixtures/events/${name}.json`, { with: { type: 'json' } });
  return structuredClone(result.default);
}

/** Create a database for testing. It uses `DATABASE_URL`, or creates an in-memory database by default. */
export async function createTestDB(opts?: { pure?: boolean }) {
  const conf = new DittoConf(Deno.env);
  const db = new DittoPolyPg(conf.databaseUrl, { poolSize: 1 });
  await db.migrate();

  const store = new DittoPgStore({
    db,
    conf,
    timeout: conf.db.timeouts.default,
    pure: opts?.pure ?? false,
    notify: false,
  });

  return {
    db,
    ...db,
    store,
    conf,
    kysely: db.kysely,
    [Symbol.asyncDispose]: async () => {
      const { rows } = await sql<
        { tablename: string }
      >`select tablename from pg_tables where schemaname = current_schema()`.execute(db.kysely);

      for (const { tablename } of rows) {
        if (tablename.startsWith('kysely_')) continue;
        await sql`truncate table ${sql.ref(tablename)} cascade`.execute(db.kysely);
      }

      await db[Symbol.asyncDispose]();
    },
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
