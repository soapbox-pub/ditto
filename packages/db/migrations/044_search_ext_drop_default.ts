import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('nostr_events').alterColumn('search_ext', (col) => col.dropDefault()).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('nostr_events')
    .alterColumn('search_ext', (col) => col.setDefault("'{}'::jsonb"))
    .execute();
}
