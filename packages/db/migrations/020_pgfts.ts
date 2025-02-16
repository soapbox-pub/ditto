import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable('nostr_pgfts')
    .ifNotExists()
    .addColumn('event_id', 'text', (c) => c.primaryKey().references('nostr_events.id').onDelete('cascade'))
    .addColumn('search_vec', sql`tsvector`, (c) => c.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('nostr_pgfts').ifExists().execute();
}
