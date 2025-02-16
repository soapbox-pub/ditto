import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('nostr_events').addColumn('language', 'char(2)').execute();

  await db.schema.createIndex('nostr_events_language_created_idx')
    .on('nostr_events')
    .columns(['language', 'created_at desc', 'id asc', 'kind'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('nostr_events').dropColumn('language').execute();
  await db.schema.dropIndex('nostr_events_language_created_idx').execute();
}
