import { Kysely } from '@/deps.ts';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('pubkey_stats')
    .addColumn('pubkey', 'text', (col) => col.primaryKey())
    .addColumn('followers_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('following_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('notes_count', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();

  await db.schema
    .createTable('event_stats')
    .addColumn('event_id', 'text', (col) => col.primaryKey().references('events.id').onDelete('cascade'))
    .addColumn('replies_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('reposts_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('reactions_count', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('pubkey_stats').execute();
  await db.schema.dropTable('event_stats').execute();
}
