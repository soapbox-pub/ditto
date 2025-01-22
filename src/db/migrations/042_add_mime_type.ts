import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('nostr_events')
    .addColumn('mime_type', 'text').execute();

  await db.schema
    .createIndex('nostr_events_mime_type_prefix_idx')
    .on('nostr_events')
    .expression(sql`split_part(mime_type, '/', 1)`)
    .column('mime_type')
    .ifNotExists()
    .execute();

  await db.schema
    .createIndex('nostr_events_mime_type_hash_idx')
    .on('nostr_events')
    .column('mime_type')
    .using('hash')
    .ifNotExists()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('nostr_events')
    .dropColumn('mime_type')
    .execute();

  await db.schema
    .dropIndex('nostr_events_mime_type_prefix_idx')
    .ifExists()
    .execute();

  await db.schema
    .dropIndex('nostr_events_mime_type_hash_idx')
    .ifExists()
    .execute();
}
