import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('author_stats').alterColumn('pubkey', (col) => col.setDataType('char(64)')).execute();
  await db.schema.alterTable('event_stats').alterColumn('event_id', (col) => col.setDataType('char(64)')).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('author_stats').alterColumn('pubkey', (col) => col.setDataType('text')).execute();
  await db.schema.alterTable('event_stats').alterColumn('event_id', (col) => col.setDataType('text')).execute();
}
