import { Kysely } from '@/deps.ts';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex('idx_events_kind_pubkey_created_at')
    .on('events')
    .columns(['kind', 'pubkey', 'created_at'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_events_kind_pubkey_created_at').execute();
}
