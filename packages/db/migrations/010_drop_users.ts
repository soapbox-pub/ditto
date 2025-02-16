import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('users').ifExists().execute();
}

export async function down(_db: Kysely<unknown>): Promise<void> {
}
