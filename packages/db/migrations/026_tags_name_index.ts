import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createIndex('idx_tags_name')
    .on('nostr_tags')
    .column('name')
    .ifNotExists()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_tags_name').ifExists().execute();
}
