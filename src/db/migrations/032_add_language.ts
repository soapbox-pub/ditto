import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('nostr_events').addColumn('language', 'char(2)').execute();
  await db.schema.createIndex('nostr_events_language_idx').on('nostr_events').column('language').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('nostr_events').dropColumn('language').execute();
  await db.schema.dropIndex('nostr_events_language_idx').execute();
}
