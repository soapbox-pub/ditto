import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count 
    FROM pg_indexes 
    WHERE indexname = 'nostr_events_new_pkey'
  `.execute(db);

  if (result.rows[0].count > 0) {
    await sql`ALTER INDEX nostr_events_new_pkey RENAME TO nostr_events_pkey;`.execute(db);
  }
}

export async function down(_db: Kysely<unknown>): Promise<void> {
}
