import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('event_zaps')
    .ifNotExists()
    .addColumn('receipt_id', 'text', (col) => col.primaryKey())
    .addColumn('target_event_id', 'text', (col) => col.notNull())
    .addColumn('sender_pubkey', 'text', (col) => col.notNull())
    .addColumn('amount', 'integer', (col) => col.notNull())
    .addColumn('comment', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex('idx_event_zaps_id_amount')
    .on('event_zaps')
    .column('amount')
    .column('target_event_id')
    .ifNotExists()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_event_zaps_id_amount').execute();
  await db.schema.dropTable('event_zaps').execute();
}
