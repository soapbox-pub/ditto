import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('events').addColumn('deleted_at', 'integer').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('events').dropColumn('deleted_at').execute();
}
