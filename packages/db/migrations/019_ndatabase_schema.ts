import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('events').renameTo('nostr_events').execute();
  await db.schema.alterTable('tags').renameTo('nostr_tags').execute();
  await db.schema.alterTable('nostr_tags').renameColumn('tag', 'name').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('nostr_events').renameTo('events').execute();
  await db.schema.alterTable('nostr_tags').renameTo('tags').execute();
  await db.schema.alterTable('tags').renameColumn('name', 'tag').execute();
}
