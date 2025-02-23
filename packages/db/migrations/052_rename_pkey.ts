import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  try {
    await sql`ALTER INDEX nostr_events_new_pkey RENAME TO nostr_events_pkey;`.execute(db);
  } catch {
    // all good
  }
}

export async function down(_db: Kysely<unknown>): Promise<void> {
}
