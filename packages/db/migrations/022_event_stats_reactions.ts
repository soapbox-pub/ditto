import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('event_stats')
    .addColumn('reactions', 'text', (col) => col.defaultTo('{}'))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('event_stats').dropColumn('reactions').execute();
}
