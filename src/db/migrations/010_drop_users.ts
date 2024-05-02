import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('users').ifExists().execute();
}

export async function down(_db: Kysely<any>): Promise<void> {
}
