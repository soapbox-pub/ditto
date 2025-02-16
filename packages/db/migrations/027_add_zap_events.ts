import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('event_zaps')
    .addColumn('receipt_id', 'text', (col) => col.primaryKey())
    .addColumn('target_event_id', 'text', (col) => col.notNull())
    .addColumn('sender_pubkey', 'text', (col) => col.notNull())
    .addColumn('amount_millisats', 'integer', (col) => col.notNull())
    .addColumn('comment', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex('idx_event_zaps_amount_millisats')
    .on('event_zaps')
    .column('amount_millisats')
    .ifNotExists()
    .execute();

  await db.schema
    .createIndex('idx_event_zaps_target_event_id')
    .on('event_zaps')
    .column('target_event_id')
    .ifNotExists()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_event_zaps_amount_millisats').ifExists().execute();
  await db.schema.dropIndex('idx_event_zaps_target_event_id').ifExists().execute();
  await db.schema.dropTable('event_zaps').execute();
}
