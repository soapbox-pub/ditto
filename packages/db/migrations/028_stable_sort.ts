import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createIndex('nostr_events_created_at_kind')
    .on('nostr_events')
    .ifNotExists()
    .columns(['created_at desc', 'id asc', 'kind'])
    .execute();

  await db.schema
    .createIndex('nostr_events_kind_pubkey_created_at')
    .on('nostr_events')
    .ifNotExists()
    .columns(['kind', 'pubkey', 'created_at desc', 'id asc'])
    .execute();

  await db.schema.dropIndex('idx_events_created_at_kind').execute();
  await db.schema.dropIndex('idx_events_kind_pubkey_created_at').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('nostr_events_created_at_kind').execute();
  await db.schema.dropIndex('nostr_events_kind_pubkey_created_at').execute();

  await db.schema
    .createIndex('idx_events_created_at_kind')
    .on('nostr_events')
    .ifNotExists()
    .columns(['created_at desc', 'kind'])
    .execute();

  await db.schema
    .createIndex('idx_events_kind_pubkey_created_at')
    .on('nostr_events')
    .ifNotExists()
    .columns(['kind', 'pubkey', 'created_at desc'])
    .execute();
}
