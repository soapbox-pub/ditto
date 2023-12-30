import { Kysely } from '@/deps.ts';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('users').execute();
}

export async function down(_db: Kysely<any>): Promise<void> {
}
