import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createIndex('idx_events_kind_pubkey_created_at')
    .on('events')
    .columns(['kind', 'pubkey', 'created_at desc'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_events_kind_pubkey_created_at').execute();
}
