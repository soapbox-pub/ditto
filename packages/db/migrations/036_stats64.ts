import { type Kysely, sql } from 'kysely';

// deno-lint-ignore no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.deleteFrom('event_stats').where(sql<number>`length(event_id)`, '>', 64).execute();
  await db.deleteFrom('author_stats').where(sql<number>`length(pubkey)`, '>', 64).execute();

  await db.schema.alterTable('event_stats').alterColumn('event_id', (col) => col.setDataType('char(64)')).execute();
  await db.schema.alterTable('author_stats').alterColumn('pubkey', (col) => col.setDataType('char(64)')).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('event_stats').alterColumn('event_id', (col) => col.setDataType('text')).execute();
  await db.schema.alterTable('author_stats').alterColumn('pubkey', (col) => col.setDataType('text')).execute();
}
