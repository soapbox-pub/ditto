import type { Kysely } from 'kysely';

export async function up(_db: Kysely<unknown>): Promise<void> {
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('users').dropColumn('admin').execute();
}
